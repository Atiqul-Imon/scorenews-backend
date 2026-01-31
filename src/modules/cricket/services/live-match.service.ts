import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { LiveMatch, LiveMatchDocument } from '../schemas/live-match.schema';
import { SportsMonksService } from './sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../utils/match-transformers';
import { determineMatchStatus } from '../utils/status-determiner';
import { isValidMatchId, sanitizeMatchId, validateMatchData } from '../utils/validation';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

@Injectable()
export class LiveMatchService {
  constructor(
    @InjectModel(LiveMatch.name) private liveMatchModel: Model<LiveMatchDocument>,
    private sportsMonksService: SportsMonksService,
    private configService: ConfigService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Get all live matches from database
   */
  async getLiveMatches(): Promise<LiveMatch[]> {
    try {
      const matches = await this.liveMatchModel
        .find({})
        .sort({ startTime: -1 })
        .lean();
      
      this.logger.log(`Found ${matches.length} live matches in database`, 'LiveMatchService');
      return matches as LiveMatch[];
    } catch (error: any) {
      this.logger.error('Error fetching live matches from database', error.stack, 'LiveMatchService');
      throw error;
    }
  }

  /**
   * Fetch live matches from API and update database
   * Primary: /livescores endpoint
   * Fallback: /fixtures endpoint with filtering
   */
  async fetchAndUpdateLiveMatches(): Promise<LiveMatch[]> {
    try {
      this.logger.log('Fetching live matches from SportsMonks API...', 'LiveMatchService');
      
      // Try livescores endpoint first
      let apiMatches: any[] = [];
      try {
        apiMatches = await this.sportsMonksService.getLiveMatches('cricket');
        this.logger.log(`Livescores endpoint returned ${apiMatches.length} matches`, 'LiveMatchService');
      } catch (error: any) {
        this.logger.warn(`Livescores endpoint failed: ${error.message}, trying fixtures fallback`, 'LiveMatchService');
        
        // Fallback: Use fixtures endpoint via SportsMonksService
        // Note: getCompletedMatches actually fetches from fixtures, but we need live ones
        // For now, return empty and let the system work with what's in database
        this.logger.warn('Livescores endpoint failed, using database only', 'LiveMatchService');
        return [];
      }

      if (apiMatches.length === 0) {
        this.logger.warn('No live matches returned from API', 'LiveMatchService');
        return [];
      }

      // Transform and filter matches
      const liveMatches: LiveMatch[] = [];
      
      for (const apiMatch of apiMatches) {
        try {
          // Log raw API match data for debugging
          this.logger.log(`Processing API match: id=${apiMatch.id}, state_id=${apiMatch.state_id}, status=${apiMatch.status}, live=${apiMatch.live}`, 'LiveMatchService');
          
          // ALWAYS fetch full match details to get batting, bowling, and complete scorecard data
          // This ensures we have all available data from the API
          let matchData = apiMatch;
          try {
            this.logger.log(`Fetching full details for match ${apiMatch.id} to get batting/bowling data...`, 'LiveMatchService');
            const fullDetails = await this.sportsMonksService.getMatchDetails(apiMatch.id.toString(), 'cricket');
            if (fullDetails) {
              // Merge: use full details but keep live status from livescores
              matchData = {
                ...fullDetails,
                live: apiMatch.live, // Keep live status from livescores
                status: apiMatch.status, // Keep status from livescores
                state_id: apiMatch.state_id, // Keep state_id from livescores
              };
              this.logger.log(`Fetched full details for match ${apiMatch.id} (has batting: ${!!fullDetails.batting}, has bowling: ${!!fullDetails.bowling})`, 'LiveMatchService');
            }
          } catch (detailError: any) {
            this.logger.warn(`Failed to fetch full details for match ${apiMatch.id}: ${detailError.message}, using livescores data only`, 'LiveMatchService');
            // Continue with livescores data - transformer will handle it
          }
          
          // CRITICAL: Matches from /livescores endpoint should be considered LIVE by default
          // Only exclude if they are explicitly marked as completed
          // The status determiner might classify some live matches as "upcoming" if state_id is 1 or 2,
          // but if they're in the livescores endpoint, they're likely live or about to start
          const statusResult = determineMatchStatus(matchData);
          
          // If status determiner says completed, trust it and skip
          if (statusResult.status === 'completed') {
            this.logger.log(`Skipping match ${matchData.id}: ${statusResult.reason} (status: ${statusResult.status})`, 'LiveMatchService');
            continue;
          }
          
          // If status determiner says live, process it
          if (statusResult.status === 'live') {
            // Process as live match - continue to transformation
            this.logger.log(`Match ${matchData.id} determined as live: ${statusResult.reason}`, 'LiveMatchService');
          } else if (statusResult.status === 'upcoming') {
            // Even if status determiner says "upcoming", if match is in livescores endpoint,
            // it might be starting soon or already started but not yet detected
            // Check if match has started (startTime is in the past) and has score data
            const hasStarted = matchData.starting_at && new Date(matchData.starting_at) <= new Date();
            const hasScoreData = matchData.scoreboards?.length > 0 || 
                                (matchData.localteam && matchData.visitorteam);
            
            if (!hasStarted) {
              // Match hasn't started yet - skip it (it's truly upcoming)
              this.logger.log(`Skipping match ${matchData.id}: ${statusResult.reason} (status: ${statusResult.status}, not started yet)`, 'LiveMatchService');
              continue;
            } else if (hasStarted && hasScoreData) {
              // Match has started and has score data - treat as live
              this.logger.log(`Match ${matchData.id} from livescores has started with score data, treating as live (was: ${statusResult.status})`, 'LiveMatchService');
            } else {
              // Match has started but no score data yet - treat as live (might be just starting)
              this.logger.log(`Match ${matchData.id} from livescores has started but no score data yet, treating as live (was: ${statusResult.status})`, 'LiveMatchService');
            }
          } else {
            // Unknown status - skip to be safe
            this.logger.warn(`Skipping match ${matchData.id}: Unknown status from determiner: ${statusResult.status}`, 'LiveMatchService');
            continue;
          }
          
          // Log confidence level for debugging
          if (statusResult.confidence !== 'high') {
            this.logger.log(`Processing match ${matchData.id} with ${statusResult.confidence} confidence: ${statusResult.reason}`, 'LiveMatchService');
          }

          // Transform to frontend format first
          let transformed;
          try {
            transformed = transformSportsMonksMatchToFrontend(matchData, 'cricket');
          } catch (transformError: any) {
            this.logger.error(`Transformer threw error for match ${matchData.id}: ${transformError.message}`, transformError.stack, 'LiveMatchService');
            continue;
          }
          
          if (!transformed || !transformed.matchId) {
            this.logger.warn(`Transformation failed for match ${matchData.id}: transformed=${!!transformed}, matchId=${transformed?.matchId}`, 'LiveMatchService');
            // Log what we got from API
            this.logger.warn(`API match data: ${JSON.stringify({
              id: matchData.id,
              name: matchData.name,
              status: matchData.status,
              state_id: matchData.state_id,
              live: matchData.live,
              localteam: !!matchData.localteam,
              visitorteam: !!matchData.visitorteam,
              localteam_id: matchData.localteam_id,
              visitorteam_id: matchData.visitorteam_id,
              scoreboards: matchData.scoreboards?.length || 0,
              has_venue: !!matchData.venue,
            })}`, 'LiveMatchService');
            continue;
          }
          
          this.logger.log(`Successfully transformed match ${matchData.id} -> ${transformed.matchId}`, 'LiveMatchService');
          this.logger.log(`Transformed match details: name=${transformed.name}, status=${transformed.status}, format=${transformed.format}`, 'LiveMatchService');
          
          // Enrich player names if they're missing (fetch from API separately)
          // This is needed because the API might not include player objects in batting/bowling data
          const hasBatting = transformed.batting && Array.isArray(transformed.batting) && transformed.batting.length > 0;
          const hasBowling = transformed.bowling && Array.isArray(transformed.bowling) && transformed.bowling.length > 0;
          const hasCurrentBatters = transformed.currentBatters && Array.isArray(transformed.currentBatters) && transformed.currentBatters.length > 0;
          const hasCurrentBowlers = transformed.currentBowlers && Array.isArray(transformed.currentBowlers) && transformed.currentBowlers.length > 0;
          
          this.logger.log(`[Match ${transformed.matchId}] Before enrichment: batting=${hasBatting ? transformed.batting.length : 0}, bowling=${hasBowling ? transformed.bowling.length : 0}, currentBatters=${hasCurrentBatters ? transformed.currentBatters.length : 0}, currentBowlers=${hasCurrentBowlers ? transformed.currentBowlers.length : 0}`, 'LiveMatchService');
          
          if (hasBatting || hasBowling || hasCurrentBatters || hasCurrentBowlers) {
            try {
              await this.enrichPlayerNames(transformed);
              this.logger.log(`[Match ${transformed.matchId}] Enriched player names successfully`, 'LiveMatchService');
            } catch (enrichError: any) {
              this.logger.warn(`[Match ${transformed.matchId}] Failed to enrich player names: ${enrichError.message}`, 'LiveMatchService');
              // Continue without enrichment - records without names will be filtered out
            }
          } else {
            this.logger.warn(`[Match ${transformed.matchId}] No batting/bowling data to enrich - API did not return batting/bowling arrays`, 'LiveMatchService');
          }
          
          // Convert to LiveMatch format - Include ALL available fields from API
          const liveMatch: LiveMatch = {
            matchId: transformed.matchId,
            series: transformed.series,
            teams: transformed.teams,
            venue: transformed.venue,
            format: transformed.format,
            startTime: transformed.startTime,
            status: transformed.status || 'live', // Ensure status is set
            currentScore: transformed.currentScore || {
              home: { runs: 0, wickets: 0, overs: 0, balls: 0 },
              away: { runs: 0, wickets: 0, overs: 0, balls: 0 },
            },
            currentBatters: transformed.currentBatters,
            currentBowlers: transformed.currentBowlers,
            partnership: transformed.partnership,
            lastWicket: transformed.lastWicket,
            innings: transformed.innings,
            liveData: transformed.liveData,
            matchStarted: transformed.matchStarted || false,
            tossWon: transformed.tossWon,
            elected: transformed.elected,
            target: transformed.target,
            round: transformed.round,
            // Include full batting and bowling scorecards
            batting: transformed.batting && Array.isArray(transformed.batting) && transformed.batting.length > 0 ? transformed.batting : undefined,
            bowling: transformed.bowling && Array.isArray(transformed.bowling) && transformed.bowling.length > 0 ? transformed.bowling : undefined,
            // Include ALL additional API fields
            refereeId: transformed.refereeId,
            firstUmpireId: transformed.firstUmpireId,
            secondUmpireId: transformed.secondUmpireId,
            tvUmpireId: transformed.tvUmpireId,
            leagueId: transformed.leagueId,
            leagueName: transformed.leagueName,
            seasonId: transformed.seasonId,
            seasonName: transformed.seasonName,
            stageId: transformed.stageId,
            stageName: transformed.stageName,
            roundName: transformed.roundName,
            type: transformed.type,
            matchType: transformed.matchType,
            stateId: transformed.stateId,
            live: transformed.live,
            venueId: transformed.venueId,
            venueCapacity: transformed.venueCapacity,
            venueImagePath: transformed.venueImagePath,
            homeTeamId: transformed.homeTeamId,
            awayTeamId: transformed.awayTeamId,
            homeTeamCode: transformed.homeTeamCode,
            awayTeamCode: transformed.awayTeamCode,
            homeTeamImagePath: transformed.homeTeamImagePath,
            awayTeamImagePath: transformed.awayTeamImagePath,
            lastUpdatedAt: new Date(),
            updateCount: 0, // Required by schema, but will be excluded from $set to avoid conflict with $inc
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          };

          // Log what we're about to save - including current batters/bowlers details
          this.logger.log(`[Match ${liveMatch.matchId}] About to save: batting=${liveMatch.batting?.length || 0}, bowling=${liveMatch.bowling?.length || 0}, currentBatters=${liveMatch.currentBatters?.length || 0}, currentBowlers=${liveMatch.currentBowlers?.length || 0}`, 'LiveMatchService');
          if (liveMatch.currentBatters && liveMatch.currentBatters.length > 0) {
            this.logger.log(`[Match ${liveMatch.matchId}] Current batters: ${liveMatch.currentBatters.map(b => `${b.playerName || 'Unknown'} (${b.runs || 0}*${b.balls || 0})`).join(', ')}`, 'LiveMatchService');
          }
          if (liveMatch.currentBowlers && liveMatch.currentBowlers.length > 0) {
            this.logger.log(`[Match ${liveMatch.matchId}] Current bowlers: ${liveMatch.currentBowlers.map(b => `${b.playerName || 'Unknown'} (${b.overs || 0}-${b.maidens || 0}-${b.runs || 0}-${b.wickets || 0})`).join(', ')}`, 'LiveMatchService');
          }
          
          // Save or update in database
          await this.saveOrUpdateLiveMatch(liveMatch);
          liveMatches.push(liveMatch);
        } catch (error: any) {
          this.logger.error(`Error processing match ${apiMatch.id}: ${error.message}`, error.stack, 'LiveMatchService');
        }
      }

      this.logger.log(`=== LIVE MATCH FETCH SUMMARY ===`, 'LiveMatchService');
      this.logger.log(`API returned: ${apiMatches.length} matches`, 'LiveMatchService');
      this.logger.log(`Successfully processed and saved: ${liveMatches.length} live matches`, 'LiveMatchService');
      if (apiMatches.length > liveMatches.length) {
        this.logger.warn(`Filtered out ${apiMatches.length - liveMatches.length} matches (not live or transformation failed)`, 'LiveMatchService');
      }
      return liveMatches;
    } catch (error: any) {
      this.logger.error('Error fetching and updating live matches', error.stack, 'LiveMatchService');
      throw error;
    }
  }

  /**
   * Enrich player names by fetching player details from API
   */
  private async enrichPlayerNames(transformed: any): Promise<void> {
    try {
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
      
      // Collect from currentBatters
      if (transformed.currentBatters && Array.isArray(transformed.currentBatters)) {
        transformed.currentBatters.forEach((b: any) => {
          if (b.playerId && !b.playerName) {
            playerIds.add(b.playerId);
          }
        });
      }
      
      // Collect from currentBowlers
      if (transformed.currentBowlers && Array.isArray(transformed.currentBowlers)) {
        transformed.currentBowlers.forEach((b: any) => {
          if (b.playerId && !b.playerName) {
            playerIds.add(b.playerId);
          }
        });
      }
      
      // Collect from lastWicket
      if (transformed.lastWicket && transformed.lastWicket.playerId && !transformed.lastWicket.playerName) {
        playerIds.add(transformed.lastWicket.playerId);
      }
      
      if (playerIds.size === 0) {
        return; // No player IDs to fetch
      }
      
      this.logger.log(`Enriching ${playerIds.size} player names for match ${transformed.matchId}`, 'LiveMatchService');
      
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
          this.logger.warn(`Failed to fetch player ${playerId}: ${error.message}`, 'LiveMatchService');
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
      
      // Update currentBatters
      if (transformed.currentBatters && Array.isArray(transformed.currentBatters)) {
        transformed.currentBatters.forEach((b: any) => {
          if (b.playerId && !b.playerName && playerMap.has(b.playerId)) {
            b.playerName = playerMap.get(b.playerId);
          }
        });
      }
      
      // Update currentBowlers
      if (transformed.currentBowlers && Array.isArray(transformed.currentBowlers)) {
        transformed.currentBowlers.forEach((b: any) => {
          if (b.playerId && !b.playerName && playerMap.has(b.playerId)) {
            b.playerName = playerMap.get(b.playerId);
          }
        });
      }
      
      // Update lastWicket
      if (transformed.lastWicket && transformed.lastWicket.playerId && !transformed.lastWicket.playerName) {
        const playerName = playerMap.get(transformed.lastWicket.playerId);
        if (playerName) {
          transformed.lastWicket.playerName = playerName;
        }
      }
      
      this.logger.log(`Successfully enriched ${playerMap.size} player names out of ${playerIds.size} requested`, 'LiveMatchService');
      
      // CRITICAL: Filter out records without player names AFTER enrichment (no placeholders)
      // This ensures we only save records with valid player names from the API
      
      // Filter batting
      if (transformed.batting && Array.isArray(transformed.batting)) {
        transformed.batting = transformed.batting.filter((b: any) => b.playerName !== undefined && b.playerName !== null);
      }
      
      // Filter bowling
      if (transformed.bowling && Array.isArray(transformed.bowling)) {
        transformed.bowling = transformed.bowling.filter((b: any) => b.playerName !== undefined && b.playerName !== null);
      }
      
      // CRITICAL: Don't filter out currentBatters/currentBowlers even if names aren't available
      // Keep them with player IDs - the frontend can handle missing names
      // Only filter if both playerId and playerName are missing (shouldn't happen, but safety check)
      if (transformed.currentBatters && Array.isArray(transformed.currentBatters)) {
        transformed.currentBatters = transformed.currentBatters.filter((b: any) => b.playerId !== undefined && b.playerId !== null);
      }
      
      if (transformed.currentBowlers && Array.isArray(transformed.currentBowlers)) {
        transformed.currentBowlers = transformed.currentBowlers.filter((b: any) => b.playerId !== undefined && b.playerId !== null);
      }
      
      // Filter lastWicket (set to undefined if no name)
      if (transformed.lastWicket && !transformed.lastWicket.playerName) {
        transformed.lastWicket = undefined;
      }
      
      this.logger.log(`After filtering: batting=${transformed.batting?.length || 0}, bowling=${transformed.bowling?.length || 0}, currentBatters=${transformed.currentBatters?.length || 0}, currentBowlers=${transformed.currentBowlers?.length || 0}`, 'LiveMatchService');
    } catch (error: any) {
      this.logger.error(`Error enriching player names: ${error.message}`, error.stack, 'LiveMatchService');
      throw error;
    }
  }

  /**
   * Save or update live match in database (atomic operation)
   */
  async saveOrUpdateLiveMatch(match: LiveMatch, session?: any): Promise<LiveMatch> {
    try {
      // Validate match data
      const validation = validateMatchData(match);
      if (!validation.valid) {
        throw new Error(`Invalid match data: ${validation.errors.join(', ')}`);
      }

      // Sanitize matchId
      const sanitizedMatchId = sanitizeMatchId(match.matchId);
      if (!sanitizedMatchId) {
        throw new Error('Invalid matchId format');
      }
      
      // Ensure matchId is consistent
      match.matchId = sanitizedMatchId;

      // Atomic upsert operation - prevents race conditions
      this.logger.log(`Saving live match to database: matchId=${match.matchId}, name=${match.series}`, 'LiveMatchService');
      
      // Use $inc for updateCount - works for both new and existing documents
      // For new documents, MongoDB treats missing field as 0 and increments to 1
      // For existing documents, it increments the current value
      // This avoids conflict between $setOnInsert and $inc on the same field
      const result = await this.liveMatchModel.findOneAndUpdate(
        { matchId: match.matchId },
        {
          $set: {
            matchId: match.matchId,
            series: match.series,
            teams: match.teams,
            venue: match.venue,
            format: match.format,
            startTime: match.startTime,
            status: match.status || 'live', // Ensure status is always set
            currentScore: match.currentScore,
            currentBatters: match.currentBatters,
            currentBowlers: match.currentBowlers,
            partnership: match.partnership,
            lastWicket: match.lastWicket,
            innings: match.innings,
            liveData: match.liveData,
            matchStarted: match.matchStarted,
            tossWon: match.tossWon,
            elected: match.elected,
            target: match.target,
            round: match.round,
            // Include full batting and bowling scorecards
            batting: match.batting,
            bowling: match.bowling,
            lastUpdatedAt: new Date(),
          },
          $inc: { updateCount: 1 }, // Works for both new and existing documents
          $setOnInsert: {
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            // Note: updateCount is NOT in $setOnInsert - $inc handles it for both cases
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          session,
        }
      ).lean();

      const finalUpdateCount = result?.updateCount || 0;
      if (finalUpdateCount > 0) {
        this.logger.log(`Updated live match ${match.matchId} (update #${finalUpdateCount}) - currentBatters: ${result?.currentBatters?.length || 0}, currentBowlers: ${result?.currentBowlers?.length || 0}`, 'LiveMatchService');
      } else {
        this.logger.log(`Created new live match ${match.matchId} - currentBatters: ${result?.currentBatters?.length || 0}, currentBowlers: ${result?.currentBowlers?.length || 0}`, 'LiveMatchService');
      }
      
      return result as LiveMatch;
    } catch (error: any) {
      // Handle MongoDB errors gracefully
      if (error.code === 11000 || error.name === 'MongoServerError') {
        // Check if it's the updateCount conflict error
        if (error.message?.includes('updateCount') && error.message?.includes('conflict')) {
          // This shouldn't happen anymore, but if it does, log and skip updateCount
          this.logger.warn(`UpdateCount conflict for match ${match.matchId}, retrying without updateCount increment...`, 'LiveMatchService');
          try {
            // Retry without $inc - just set the fields
            const retryResult = await this.liveMatchModel.findOneAndUpdate(
              { matchId: match.matchId },
              {
                $set: {
                  matchId: match.matchId,
                  series: match.series,
                  teams: match.teams,
                  venue: match.venue,
                  format: match.format,
                  startTime: match.startTime,
                  currentScore: match.currentScore,
                  currentBatters: match.currentBatters,
                  currentBowlers: match.currentBowlers,
                  partnership: match.partnership,
                  lastWicket: match.lastWicket,
                  innings: match.innings,
                  liveData: match.liveData,
                  matchStarted: match.matchStarted,
                  tossWon: match.tossWon,
                  elected: match.elected,
                  target: match.target,
                  round: match.round,
                  lastUpdatedAt: new Date(),
                },
                $setOnInsert: {
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                  updateCount: 1, // Set to 1 for new documents only
                },
              },
              {
                upsert: true,
                new: true,
                runValidators: true,
                session,
              }
            ).lean();
            this.logger.log(`Retry successful for match ${match.matchId}`, 'LiveMatchService');
            return retryResult as LiveMatch;
          } catch (retryError: any) {
            this.logger.error(`Retry failed for match ${match.matchId}: ${retryError.message}`, retryError.stack, 'LiveMatchService');
            throw retryError;
          }
        } else {
          // Other duplicate key errors - retry with same approach
          this.logger.warn(`Duplicate key error for match ${match.matchId}, retrying...`, 'LiveMatchService');
          try {
            const retryResult = await this.liveMatchModel.findOneAndUpdate(
              { matchId: match.matchId },
              {
                $set: {
                  matchId: match.matchId,
                  series: match.series,
                  teams: match.teams,
                  venue: match.venue,
                  format: match.format,
                  startTime: match.startTime,
                  currentScore: match.currentScore,
                  currentBatters: match.currentBatters,
                  currentBowlers: match.currentBowlers,
                  partnership: match.partnership,
                  lastWicket: match.lastWicket,
                  innings: match.innings,
                  liveData: match.liveData,
                  matchStarted: match.matchStarted,
                  tossWon: match.tossWon,
                  elected: match.elected,
                  target: match.target,
                  round: match.round,
                  lastUpdatedAt: new Date(),
                },
                $inc: { updateCount: 1 },
                $setOnInsert: {
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                },
              },
              {
                upsert: true,
                new: true,
                runValidators: true,
                session,
              }
            ).lean();
            this.logger.log(`Retry successful for match ${match.matchId}`, 'LiveMatchService');
            return retryResult as LiveMatch;
          } catch (retryError: any) {
            this.logger.error(`Retry failed for match ${match.matchId}`, retryError.stack, 'LiveMatchService');
            throw retryError;
          }
        }
      }
      this.logger.error(`Error saving live match ${match.matchId}`, error.stack, 'LiveMatchService');
      throw error;
    }
  }

  /**
   * Check if match should transition to completed
   * Includes retry logic for API failures
   */
  async checkMatchCompletion(matchId: string, retries: number = 2): Promise<boolean> {
    if (!matchId || typeof matchId !== 'string') {
      this.logger.warn(`Invalid matchId for completion check: ${matchId}`, 'LiveMatchService');
      return false;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Fetch fresh data from API
        const apiMatch = await this.sportsMonksService.getMatchDetails(matchId, 'cricket');
        if (!apiMatch) {
          if (attempt < retries) {
            this.logger.warn(`API returned null for match ${matchId}, retrying... (attempt ${attempt + 1}/${retries + 1})`, 'LiveMatchService');
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
            continue;
          }
          return false;
        }

        const statusResult = determineMatchStatus(apiMatch);
        const isCompleted = statusResult.status === 'completed' && statusResult.confidence === 'high';
        
        if (isCompleted) {
          this.logger.log(`Match ${matchId} confirmed as completed (${statusResult.reason})`, 'LiveMatchService');
        }
        
        return isCompleted;
      } catch (error: any) {
        if (attempt < retries) {
          this.logger.warn(`Error checking completion for match ${matchId}, retrying... (attempt ${attempt + 1}/${retries + 1})`, 'LiveMatchService');
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        this.logger.error(`Error checking completion for match ${matchId} after ${retries + 1} attempts`, error.stack, 'LiveMatchService');
        return false;
      }
    }
    
    return false;
  }

  /**
   * Get live match by ID
   */
  async getLiveMatchById(matchId: string): Promise<LiveMatch | null> {
    try {
      if (!isValidMatchId(matchId)) {
        this.logger.warn(`Invalid matchId format: ${matchId}`, 'LiveMatchService');
        return null;
      }

      const sanitizedId = sanitizeMatchId(matchId);
      if (!sanitizedId) {
        return null;
      }

      const match = await this.liveMatchModel.findOne({ matchId: sanitizedId }).lean();
      return match as LiveMatch | null;
    } catch (error: any) {
      this.logger.error(`Error fetching live match ${matchId}`, error.stack, 'LiveMatchService');
      return null;
    }
  }

  /**
   * Delete live match (used during transition to completed)
   */
  async deleteLiveMatch(matchId: string, session?: any): Promise<boolean> {
    try {
      if (!matchId || typeof matchId !== 'string') {
        throw new Error('Invalid matchId: must be a non-empty string');
      }

      const result = await this.liveMatchModel.deleteOne(
        { matchId },
        { session }
      );
      
      if (result.deletedCount > 0) {
        this.logger.log(`Deleted live match ${matchId}`, 'LiveMatchService');
        return true;
      } else {
        this.logger.warn(`Live match ${matchId} not found for deletion`, 'LiveMatchService');
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Error deleting live match ${matchId}`, error.stack, 'LiveMatchService');
      throw error;
    }
  }
}

