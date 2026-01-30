import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CompletedMatch, CompletedMatchDocument } from '../schemas/completed-match.schema';
import { SportsMonksService } from './sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../utils/match-transformers';
import { parseApiResultNote, calculateMatchResult } from '../utils/match-transformers';
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

      return {
        matches: matches as CompletedMatch[],
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

          // Calculate result if still not available
          if (!result && transformed.currentScore) {
            result = calculateMatchResult(
              transformed.currentScore,
              transformed.innings || [],
              transformed.teams,
              fullMatchData.localteam_id,
              fullMatchData.visitorteam_id,
              true, // isV2Format
              fullMatchData.winner_team_id
            );
            if (result) {
              result.dataSource = 'calculated';
            }
          }

          if (!result) {
            this.logger.warn(`Could not determine result for match ${apiMatch.id}`, 'CompletedMatchService');
            continue;
          }

          // Convert to CompletedMatch format
          const completedMatch: CompletedMatch = {
            matchId: transformed.matchId,
            series: transformed.series,
            teams: transformed.teams,
            venue: transformed.venue,
            format: transformed.format,
            startTime: transformed.startTime,
            endTime: transformed.endTime || new Date(),
            finalScore: {
              home: {
                runs: transformed.currentScore?.home?.runs || 0,
                wickets: transformed.currentScore?.home?.wickets || 0,
                overs: transformed.currentScore?.home?.overs || 0,
              },
              away: {
                runs: transformed.currentScore?.away?.runs || 0,
                wickets: transformed.currentScore?.away?.wickets || 0,
                overs: transformed.currentScore?.away?.overs || 0,
              },
            },
            result: {
              winner: result.winner as 'home' | 'away' | 'draw',
              winnerName: result.winnerName,
              margin: result.margin,
              marginType: result.marginType,
              resultText: result.resultText,
              dataSource: result.dataSource || 'api',
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
            dataSource: result.dataSource || 'api',
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
        return match as CompletedMatch;
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

      // Calculate result if still not available
      if (!result && transformed.currentScore) {
        result = calculateMatchResult(
          transformed.currentScore,
          transformed.innings || [],
          transformed.teams,
          fullMatchData.localteam_id,
          fullMatchData.visitorteam_id,
          true,
          fullMatchData.winner_team_id
        );
        if (result) {
          result.dataSource = 'calculated';
        }
      }

      if (!result) {
        this.logger.warn(`Could not determine result for match ${apiMatch.id}`, 'CompletedMatchService');
        return null;
      }

      // Convert to CompletedMatch format
      const completedMatch: CompletedMatch = {
        matchId: transformed.matchId,
        series: transformed.series,
        teams: transformed.teams,
        venue: transformed.venue,
        format: transformed.format,
        startTime: transformed.startTime,
        endTime: transformed.endTime || new Date(),
        finalScore: {
          home: {
            runs: transformed.currentScore?.home?.runs || 0,
            wickets: transformed.currentScore?.home?.wickets || 0,
            overs: transformed.currentScore?.home?.overs || 0,
          },
          away: {
            runs: transformed.currentScore?.away?.runs || 0,
            wickets: transformed.currentScore?.away?.wickets || 0,
            overs: transformed.currentScore?.away?.overs || 0,
          },
        },
        result: {
          winner: result.winner as 'home' | 'away' | 'draw',
          winnerName: result.winnerName,
          margin: result.margin,
          marginType: result.marginType,
          resultText: result.resultText,
          dataSource: result.dataSource || 'api',
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
        dataSource: result.dataSource || 'api',
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
}


