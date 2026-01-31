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
          
          // Determine status
          const statusResult = determineMatchStatus(matchData);
          
          // Process if live (accept medium confidence too, as API can be inconsistent)
          if (statusResult.status !== 'live') {
            this.logger.log(`Skipping match ${matchData.id}: ${statusResult.reason} (status: ${statusResult.status})`, 'LiveMatchService');
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
          
          // Convert to LiveMatch format
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
            batting: transformed.batting,
            bowling: transformed.bowling,
            lastUpdatedAt: new Date(),
            updateCount: 0, // Required by schema, but will be excluded from $set to avoid conflict with $inc
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          };

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
        this.logger.log(`Updated live match ${match.matchId} (update #${finalUpdateCount})`, 'LiveMatchService');
      } else {
        this.logger.log(`Created new live match ${match.matchId}`, 'LiveMatchService');
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

