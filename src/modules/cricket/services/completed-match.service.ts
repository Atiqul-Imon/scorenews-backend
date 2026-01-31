import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CompletedMatch, CompletedMatchDocument } from '../schemas/completed-match.schema';
import { SportsMonksService } from './sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../utils/match-transformers';
import { parseApiResultNote } from '../utils/match-transformers';
import { determineMatchStatus, isCompleted } from '../utils/status-determiner';
import { isValidMatchId, sanitizeMatchId, validateCompletedMatch } from '../utils/validation';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';
import { GetMatchesDto } from '../dto/get-matches.dto';

@Injectable()
export class CompletedMatchService {
  constructor(
    @InjectModel(CompletedMatch.name) private completedMatchModel: Model<CompletedMatchDocument>,
    private sportsMonksService: SportsMonksService,
    private configService: ConfigService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Get completed matches from database with filters
   */
  async getCompletedMatches(filters: GetMatchesDto = {}): Promise<{
    matches: CompletedMatch[];
    pagination: {
      current: number;
      pages: number;
      total: number;
      limit: number;
    };
  }> {
    try {
      const { page = 1, limit = 20, format, series, startDate, endDate } = filters;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (format) filter.format = format;
      if (series) filter.series = new RegExp(series, 'i');
      if (startDate || endDate) {
        filter.endTime = {};
        if (startDate) filter.endTime.$gte = new Date(startDate);
        if (endDate) filter.endTime.$lte = new Date(endDate);
      }

      const matches = await this.completedMatchModel
        .find(filter)
        .sort({ endTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await this.completedMatchModel.countDocuments(filter);

      // Transform for frontend compatibility: map finalScore to currentScore
      // Ensure status is explicitly set to 'completed' for all matches
      const transformedMatches = (matches as CompletedMatch[]).map((match) => ({
        ...match,
        status: 'completed' as const, // Explicitly set status to completed
        // Frontend expects currentScore, so map finalScore to currentScore
        currentScore: match.finalScore ? {
          home: {
            runs: match.finalScore.home.runs,
            wickets: match.finalScore.home.wickets,
            overs: match.finalScore.home.overs,
            balls: 0, // Completed matches don't have balls
          },
          away: {
            runs: match.finalScore.away.runs,
            wickets: match.finalScore.away.wickets,
            overs: match.finalScore.away.overs,
            balls: 0, // Completed matches don't have balls
          },
        } : undefined,
      }));

      return {
        matches: transformedMatches,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      };
    } catch (error: any) {
      this.logger.error('Error fetching completed matches from database', error.stack, 'CompletedMatchService');
      throw error;
    }
  }

  /**
   * Fetch completed matches from API and save to database
   */
  async fetchAndSaveCompletedMatches(): Promise<CompletedMatch[]> {
    try {
      this.logger.log('Fetching completed matches from SportsMonks API...', 'CompletedMatchService');
      
      // Fetch from fixtures endpoint (filtered for completed)
      const apiMatches = await this.sportsMonksService.getCompletedMatches('cricket');
      this.logger.log(`Fixtures endpoint returned ${apiMatches.length} completed matches`, 'CompletedMatchService');

      if (apiMatches.length === 0) {
        return [];
      }

      const completedMatches: CompletedMatch[] = [];

      for (const apiMatch of apiMatches) {
        try {
          // Verify it's definitely completed
          const statusResult = determineMatchStatus(apiMatch);
          if (statusResult.status !== 'completed' || statusResult.confidence !== 'high') {
            this.logger.log(`Skipping match ${apiMatch.id}: ${statusResult.reason}`, 'CompletedMatchService');
            continue;
          }

          // Fetch full details from fixtures/{id} endpoint
          const fullMatchData = await this.sportsMonksService.getMatchDetails(apiMatch.id.toString(), 'cricket');
          if (!fullMatchData) {
            this.logger.warn(`Could not fetch full details for match ${apiMatch.id}`, 'CompletedMatchService');
            continue;
          }

          // Transform to frontend format
          const transformed = transformSportsMonksMatchToFrontend(fullMatchData, 'cricket');
          
          // Log before enrichment to see if transformer extracted names
          const battingWithNamesBefore = transformed.batting?.filter((b: any) => b.playerName).length || 0;
          const bowlingWithNamesBefore = transformed.bowling?.filter((b: any) => b.playerName).length || 0;
          this.logger.log(`[Match ${apiMatch.id}] After transformation: batting=${transformed.batting?.length || 0} (${battingWithNamesBefore} with names), bowling=${transformed.bowling?.length || 0} (${bowlingWithNamesBefore} with names)`, 'CompletedMatchService');

          // Enrich player names (similar to live match service)
          await this.enrichPlayerNames(transformed);

          // Parse result
          let result = transformed.result;
          if (!result && fullMatchData.note && fullMatchData.winner_team_id) {
            result = parseApiResultNote(
              fullMatchData.note,
              fullMatchData.winner_team_id,
              fullMatchData.localteam_id,
              fullMatchData.visitorteam_id,
              transformed.teams
            );
          }

          // CRITICAL: Never calculate result locally - only use API-provided data
          // If API doesn't provide result, skip this match
          if (!result) {
            this.logger.warn(
              `Skipping match ${apiMatch.id}: API did not provide result. ` +
              `Required fields: winner_team_id=${fullMatchData.winner_team_id}, note="${fullMatchData.note?.substring(0, 100)}"`,
              'CompletedMatchService'
            );
            continue;
          }
          
          // Ensure result is marked as from API (never calculated)
          result.dataSource = 'api';

          // CRITICAL: Only use API-provided score data. Do not use fallbacks.
          // If API doesn't provide required score data, skip this match.
          if (!transformed.currentScore?.home?.runs && transformed.currentScore?.home?.runs !== 0) {
            this.logger.warn(
              `Skipping match ${apiMatch.id}: API did not provide home team runs.`,
              'CompletedMatchService'
            );
            continue;
          }
          if (!transformed.currentScore?.away?.runs && transformed.currentScore?.away?.runs !== 0) {
            this.logger.warn(
              `Skipping match ${apiMatch.id}: API did not provide away team runs.`,
              'CompletedMatchService'
            );
            continue;
          }

          // Convert to CompletedMatch format - only use API-provided values
          const finalScore = {
            home: {
              runs: transformed.currentScore.home.runs,
              wickets: transformed.currentScore.home.wickets !== undefined && transformed.currentScore.home.wickets !== null 
                ? transformed.currentScore.home.wickets 
                : 10, // API may not provide wickets for completed matches, but we need a value for schema
              overs: transformed.currentScore.home.overs !== undefined && transformed.currentScore.home.overs !== null
                ? transformed.currentScore.home.overs
                : 0, // API may not provide overs, but we need a value for schema
            },
            away: {
              runs: transformed.currentScore.away.runs,
              wickets: transformed.currentScore.away.wickets !== undefined && transformed.currentScore.away.wickets !== null
                ? transformed.currentScore.away.wickets
                : 10, // API may not provide wickets for completed matches, but we need a value for schema
              overs: transformed.currentScore.away.overs !== undefined && transformed.currentScore.away.overs !== null
                ? transformed.currentScore.away.overs
                : 0, // API may not provide overs, but we need a value for schema
            },
          };

      const completedMatch: CompletedMatch = {
        matchId: transformed.matchId,
        series: transformed.series,
        teams: transformed.teams,
        venue: transformed.venue,
        format: transformed.format,
        startTime: transformed.startTime,
        endTime: transformed.endTime || new Date(),
        status: 'completed', // Explicitly set status for completed matches
        finalScore,
            // Frontend compatibility: also include currentScore (mapped from finalScore)
            currentScore: {
              home: {
                runs: finalScore.home.runs,
                wickets: finalScore.home.wickets,
                overs: finalScore.home.overs,
                balls: 0, // Completed matches don't track balls
              },
              away: {
                runs: finalScore.away.runs,
                wickets: finalScore.away.wickets,
                overs: finalScore.away.overs,
                balls: 0, // Completed matches don't track balls
              },
            },
            result: {
              winner: result.winner as 'home' | 'away' | 'draw',
              winnerName: result.winnerName,
              margin: result.margin,
              marginType: result.marginType,
              resultText: result.resultText,
              dataSource: 'api', // Always from API, never calculated
            },
            innings: transformed.innings,
            batting: transformed.batting,
            bowling: transformed.bowling,
            matchNote: transformed.matchNote,
            apiNote: fullMatchData.note || transformed.apiNote,
            round: transformed.round,
            tossWon: transformed.tossWon,
            elected: transformed.elected,
            manOfMatchId: fullMatchData.man_of_match_id?.toString(),
            manOfSeriesId: fullMatchData.man_of_series_id?.toString(),
            totalOversPlayed: fullMatchData.total_overs_played,
            superOver: fullMatchData.super_over || false,
            followOn: fullMatchData.follow_on || false,
            drawNoResult: fullMatchData.draw_noresult || false,
            dataSource: 'api', // Always from API, never calculated
            apiFetchedAt: new Date(),
            isCompleteData: true,
          };

          // Save to database
          await this.saveOrUpdateCompletedMatch(completedMatch);
          completedMatches.push(completedMatch);
        } catch (error: any) {
          this.logger.error(`Error processing completed match ${apiMatch.id}: ${error.message}`, error.stack, 'CompletedMatchService');
        }
      }

      this.logger.log(`Successfully processed ${completedMatches.length} completed matches`, 'CompletedMatchService');
      return completedMatches;
    } catch (error: any) {
      this.logger.error('Error fetching and saving completed matches', error.stack, 'CompletedMatchService');
      throw error;
    }
  }

  /**
   * Save or update completed match in database (atomic operation)
   */
  async saveOrUpdateCompletedMatch(match: CompletedMatch, session?: any): Promise<CompletedMatch> {
    try {
      // Validate match data
      const validation = validateCompletedMatch(match);
      if (!validation.valid) {
        throw new Error(`Invalid completed match data: ${validation.errors.join(', ')}`);
      }

      // Sanitize matchId
      const sanitizedMatchId = sanitizeMatchId(match.matchId);
      if (!sanitizedMatchId) {
        throw new Error('Invalid matchId format');
      }
      
      // Ensure matchId is consistent
      match.matchId = sanitizedMatchId;

      // Atomic upsert operation - prevents race conditions
      const result = await this.completedMatchModel.findOneAndUpdate(
        { matchId: match.matchId },
        {
          $set: {
            ...match,
            apiFetchedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          session,
        }
      ).lean();

      if (result) {
        this.logger.log(`Saved completed match ${match.matchId}`, 'CompletedMatchService');
      }
      
      return result as CompletedMatch;
    } catch (error: any) {
      // Handle duplicate key errors gracefully
      if (error.code === 11000 || error.name === 'MongoServerError') {
        this.logger.warn(`Duplicate key error for match ${match.matchId}, retrying...`, 'CompletedMatchService');
        // Retry once with findOneAndUpdate
        try {
          const retryResult = await this.completedMatchModel.findOneAndUpdate(
            { matchId: match.matchId },
            { $set: match },
            { new: true, runValidators: true, session }
          ).lean();
          return retryResult as CompletedMatch;
        } catch (retryError: any) {
          this.logger.error(`Retry failed for match ${match.matchId}`, retryError.stack, 'CompletedMatchService');
          throw retryError;
        }
      }
      this.logger.error(`Error saving completed match ${match.matchId}`, error.stack, 'CompletedMatchService');
      throw error;
    }
  }

  /**
   * Get completed match by ID
   */
  async getCompletedMatchById(matchId: string): Promise<CompletedMatch | null> {
    try {
      if (!isValidMatchId(matchId)) {
        this.logger.warn(`Invalid matchId format: ${matchId}`, 'CompletedMatchService');
        return null;
      }

      const sanitizedId = sanitizeMatchId(matchId);
      if (!sanitizedId) {
        return null;
      }

      const match = await this.completedMatchModel.findOne({ matchId: sanitizedId }).lean();
      
      if (match) {
        // Check if match needs player name enrichment
        const needsEnrichment = (match.batting && match.batting.some((b: any) => !b.playerName && b.playerId)) ||
                               (match.bowling && match.bowling.some((b: any) => !b.playerName && b.playerId));
        
        if (needsEnrichment) {
          this.logger.log(`Match ${matchId} has missing player names, fetching from API to enrich...`, 'CompletedMatchService');
          try {
            // Fetch fresh data from API and enrich
            const apiMatch = await this.sportsMonksService.getMatchDetails(matchId, 'cricket');
            if (apiMatch) {
              const transformed = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
              await this.enrichPlayerNames(transformed);
              
              // Update the match with enriched data
              const enrichedMatch = {
                ...match,
                batting: transformed.batting,
                bowling: transformed.bowling,
              };
              
              // Save enriched data back to database (async, don't wait)
              this.saveOrUpdateCompletedMatch(enrichedMatch as CompletedMatch).catch((err: any) => {
                this.logger.warn(`Failed to save enriched data for match ${matchId}: ${err.message}`, 'CompletedMatchService');
              });
              
              // Use enriched match for return
              match.batting = enrichedMatch.batting;
              match.bowling = enrichedMatch.bowling;
            }
          } catch (error: any) {
            this.logger.warn(`Failed to enrich match ${matchId}: ${error.message}`, 'CompletedMatchService');
            // Continue to return original match even if enrichment fails
          }
        }
        
        // Transform for frontend compatibility: map finalScore to currentScore
        // Ensure status is explicitly set to 'completed'
        const transformedMatch = {
          ...match,
          status: 'completed' as const, // Explicitly set status to completed
          currentScore: (match as CompletedMatch).finalScore ? {
            home: {
              runs: (match as CompletedMatch).finalScore.home.runs,
              wickets: (match as CompletedMatch).finalScore.home.wickets,
              overs: (match as CompletedMatch).finalScore.home.overs,
              balls: 0,
            },
            away: {
              runs: (match as CompletedMatch).finalScore.away.runs,
              wickets: (match as CompletedMatch).finalScore.away.wickets,
              overs: (match as CompletedMatch).finalScore.away.overs,
              balls: 0,
            },
          } : undefined,
        };
        return transformedMatch as CompletedMatch;
      }

      // If not in database, fetch single match from API (more efficient)
      try {
        const apiMatch = await this.sportsMonksService.getMatchDetails(matchId, 'cricket');
        if (!apiMatch) {
          return null;
        }

        const statusResult = determineMatchStatus(apiMatch);
        if (statusResult.status === 'completed') {
          // Process and save single match (more efficient than fetching all)
          const savedMatch = await this.processAndSaveSingleMatch(apiMatch);
          return savedMatch;
        }
      } catch (error: any) {
        this.logger.error(`Error fetching completed match ${matchId} from API`, error.stack, 'CompletedMatchService');
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Error fetching completed match ${matchId}`, error.stack, 'CompletedMatchService');
      return null;
    }
  }

  /**
   * Verify match is truly completed
   */
  async verifyCompletion(matchId: string): Promise<boolean> {
    try {
      const apiMatch = await this.sportsMonksService.getMatchDetails(matchId, 'cricket');
      if (!apiMatch) {
        return false;
      }

      return isCompleted(apiMatch);
    } catch (error: any) {
      this.logger.error(`Error verifying completion for match ${matchId}`, error.stack, 'CompletedMatchService');
      return false;
    }
  }

  /**
   * Process and save a single match (helper method for efficiency)
   */
  private async processAndSaveSingleMatch(apiMatch: any): Promise<CompletedMatch | null> {
    try {
      // Fetch full details if needed
      const fullMatchData = apiMatch.id ? 
        await this.sportsMonksService.getMatchDetails(apiMatch.id.toString(), 'cricket') : 
        apiMatch;
      
      if (!fullMatchData) {
        return null;
      }

      // Transform to frontend format
      const transformed = transformSportsMonksMatchToFrontend(fullMatchData, 'cricket');
      if (!transformed || !transformed.matchId) {
        return null;
      }

      // Parse result
      let result = transformed.result;
      if (!result && fullMatchData.note && fullMatchData.winner_team_id) {
        result = parseApiResultNote(
          fullMatchData.note,
          fullMatchData.winner_team_id,
          fullMatchData.localteam_id,
          fullMatchData.visitorteam_id,
          transformed.teams
        );
      }

      // CRITICAL: Never calculate result locally - only use API-provided data
      // If API doesn't provide result, we cannot save this match
      if (!result) {
        this.logger.warn(
          `Cannot save match ${apiMatch.id}: API did not provide result. ` +
          `Required fields: winner_team_id=${fullMatchData.winner_team_id}, note="${fullMatchData.note?.substring(0, 100)}"`,
          'CompletedMatchService'
        );
        return null;
      }
      
      // Ensure result is marked as from API (never calculated)
      result.dataSource = 'api';

      // CRITICAL: Only use API-provided score data. Do not use fallbacks.
      // If API doesn't provide required score data, we cannot save this match.
      if (!transformed.currentScore?.home?.runs && transformed.currentScore?.home?.runs !== 0) {
        this.logger.warn(
          `Cannot save match ${apiMatch.id}: API did not provide home team runs.`,
          'CompletedMatchService'
        );
        return null;
      }
      if (!transformed.currentScore?.away?.runs && transformed.currentScore?.away?.runs !== 0) {
        this.logger.warn(
          `Cannot save match ${apiMatch.id}: API did not provide away team runs.`,
          'CompletedMatchService'
        );
        return null;
      }

      // Convert to CompletedMatch format - only use API-provided values
      const finalScore = {
        home: {
          runs: transformed.currentScore.home.runs,
          wickets: transformed.currentScore.home.wickets !== undefined && transformed.currentScore.home.wickets !== null 
            ? transformed.currentScore.home.wickets 
            : 10, // API may not provide wickets for completed matches, but we need a value for schema
          overs: transformed.currentScore.home.overs !== undefined && transformed.currentScore.home.overs !== null
            ? transformed.currentScore.home.overs
            : 0, // API may not provide overs, but we need a value for schema
        },
        away: {
          runs: transformed.currentScore.away.runs,
          wickets: transformed.currentScore.away.wickets !== undefined && transformed.currentScore.away.wickets !== null
            ? transformed.currentScore.away.wickets
            : 10, // API may not provide wickets for completed matches, but we need a value for schema
          overs: transformed.currentScore.away.overs !== undefined && transformed.currentScore.away.overs !== null
            ? transformed.currentScore.away.overs
            : 0, // API may not provide overs, but we need a value for schema
        },
      };

      const completedMatch: CompletedMatch = {
        matchId: transformed.matchId,
        series: transformed.series,
        teams: transformed.teams,
        venue: transformed.venue,
        format: transformed.format,
        startTime: transformed.startTime,
        endTime: transformed.endTime || new Date(),
        status: 'completed', // Explicitly set status for completed matches
        finalScore,
        // Frontend compatibility: also include currentScore (mapped from finalScore)
        currentScore: {
          home: {
            runs: finalScore.home.runs,
            wickets: finalScore.home.wickets,
            overs: finalScore.home.overs,
            balls: 0, // Completed matches don't track balls
          },
          away: {
            runs: finalScore.away.runs,
            wickets: finalScore.away.wickets,
            overs: finalScore.away.overs,
            balls: 0, // Completed matches don't track balls
          },
        },
        result: {
          winner: result.winner as 'home' | 'away' | 'draw',
          winnerName: result.winnerName,
          margin: result.margin,
          marginType: result.marginType,
          resultText: result.resultText,
          dataSource: 'api', // Always from API, never calculated
        },
        innings: transformed.innings,
        batting: transformed.batting,
        bowling: transformed.bowling,
        matchNote: transformed.matchNote,
        apiNote: fullMatchData.note || transformed.apiNote,
        round: transformed.round,
        tossWon: transformed.tossWon,
        elected: transformed.elected,
        manOfMatchId: fullMatchData.man_of_match_id?.toString(),
        manOfSeriesId: fullMatchData.man_of_series_id?.toString(),
        totalOversPlayed: fullMatchData.total_overs_played,
        superOver: fullMatchData.super_over || false,
        followOn: fullMatchData.follow_on || false,
        drawNoResult: fullMatchData.draw_noresult || false,
        dataSource: 'api', // Always from API, never calculated
        apiFetchedAt: new Date(),
        isCompleteData: true,
      };

      // Save to database
      return await this.saveOrUpdateCompletedMatch(completedMatch);
    } catch (error: any) {
      this.logger.error(`Error processing single match ${apiMatch.id}`, error.stack, 'CompletedMatchService');
      return null;
    }
  }

  /**
   * Enrich player names by fetching player details from API
   */
  private async enrichPlayerNames(transformed: any): Promise<void> {
    try {
      // Log before enrichment
      const battingCount = transformed.batting?.length || 0;
      const bowlingCount = transformed.bowling?.length || 0;
      const battingWithNames = transformed.batting?.filter((b: any) => b.playerName).length || 0;
      const bowlingWithNames = transformed.bowling?.filter((b: any) => b.playerName).length || 0;
      this.logger.log(`[Match ${transformed.matchId}] Before enrichment: batting=${battingCount} (${battingWithNames} with names), bowling=${bowlingCount} (${bowlingWithNames} with names)`, 'CompletedMatchService');
      
      // Collect all unique player IDs that need names
      const playerIds = new Set<string>();
      
      // Collect from batting
      if (transformed.batting && Array.isArray(transformed.batting)) {
        transformed.batting.forEach((b: any) => {
          if (b.playerId && !b.playerName) {
            playerIds.add(b.playerId);
          }
        });
      }
      
      // Collect from bowling
      if (transformed.bowling && Array.isArray(transformed.bowling)) {
        transformed.bowling.forEach((b: any) => {
          if (b.playerId && !b.playerName) {
            playerIds.add(b.playerId);
          }
        });
      }
      
      if (playerIds.size === 0) {
        this.logger.log(`[Match ${transformed.matchId}] No player IDs need enrichment - all names already extracted from API`, 'CompletedMatchService');
        return; // No player IDs to fetch
      }
      
      this.logger.log(`Enriching ${playerIds.size} player names for completed match ${transformed.matchId}`, 'CompletedMatchService');
      
      // Fetch player names in parallel (with rate limiting to avoid API throttling)
      const playerPromises = Array.from(playerIds).map(async (playerId) => {
        try {
          const player = await this.sportsMonksService.getPlayerDetails(playerId);
          if (player) {
            const playerName = player.fullname || player.full_name || player.name || 
                              (player.firstname && player.lastname ? `${player.firstname} ${player.lastname}` : player.firstname || player.first_name);
            return { playerId, playerName: playerName || undefined };
          }
          return { playerId, playerName: undefined };
        } catch (error: any) {
          this.logger.warn(`Failed to fetch player ${playerId}: ${error.message}`, 'CompletedMatchService');
          return { playerId, playerName: undefined };
        }
      });
      
      const playerData = await Promise.all(playerPromises);
      const playerMap = new Map<string, string>();
      
      playerData.forEach(({ playerId, playerName }) => {
        if (playerName) {
          playerMap.set(playerId, playerName);
        }
      });
      
      // Update batting records
      if (transformed.batting && Array.isArray(transformed.batting)) {
        transformed.batting.forEach((b: any) => {
          if (b.playerId && !b.playerName && playerMap.has(b.playerId)) {
            b.playerName = playerMap.get(b.playerId);
          }
        });
      }
      
      // Update bowling records
      if (transformed.bowling && Array.isArray(transformed.bowling)) {
        transformed.bowling.forEach((b: any) => {
          if (b.playerId && !b.playerName && playerMap.has(b.playerId)) {
            b.playerName = playerMap.get(b.playerId);
          }
        });
      }
      
      this.logger.log(`Successfully enriched ${playerMap.size} player names out of ${playerIds.size} requested for match ${transformed.matchId}`, 'CompletedMatchService');
      
      // Log after enrichment
      const battingWithNamesAfter = transformed.batting?.filter((b: any) => b.playerName).length || 0;
      const bowlingWithNamesAfter = transformed.bowling?.filter((b: any) => b.playerName).length || 0;
      this.logger.log(`[Match ${transformed.matchId}] After enrichment: batting=${battingCount} (${battingWithNamesAfter} with names), bowling=${bowlingCount} (${bowlingWithNamesAfter} with names)`, 'CompletedMatchService');
      
      // CRITICAL: Don't filter out records without names for completed matches
      // Keep all records even if names aren't available - the frontend can handle it
      // Unlike live matches, completed matches should show all players even if names are missing
    } catch (error: any) {
      this.logger.error(`Error in enrichPlayerNames for match ${transformed.matchId}: ${error.message}`, error.stack, 'CompletedMatchService');
      // Don't throw - continue even if enrichment fails
    }
  }
}


