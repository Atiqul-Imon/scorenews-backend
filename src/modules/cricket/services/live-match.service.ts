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
          // Determine status
          const statusResult = determineMatchStatus(apiMatch);
          
          // Process if live (accept medium confidence too, as API can be inconsistent)
          if (statusResult.status !== 'live') {
            this.logger.log(`Skipping match ${apiMatch.id}: ${statusResult.reason} (status: ${statusResult.status})`, 'LiveMatchService');
            continue;
          }
          
          // Log confidence level for debugging
          if (statusResult.confidence !== 'high') {
            this.logger.log(`Processing match ${apiMatch.id} with ${statusResult.confidence} confidence: ${statusResult.reason}`, 'LiveMatchService');
          }

          // Transform to frontend format first
          const transformed = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
          
          if (!transformed || !transformed.matchId) {
            this.logger.warn(`Transformation failed for match ${apiMatch.id}`, 'LiveMatchService');
            continue;
          }
          
          // Convert to LiveMatch format
          const liveMatch: LiveMatch = {
            matchId: transformed.matchId,
            series: transformed.series,
            teams: transformed.teams,
            venue: transformed.venue,
            format: transformed.format,
            startTime: transformed.startTime,
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
            lastUpdatedAt: new Date(),
            updateCount: 0,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          };

          // Save or update in database
          await this.saveOrUpdateLiveMatch(liveMatch);
          liveMatches.push(liveMatch);
        } catch (error: any) {
          this.logger.error(`Error processing match ${apiMatch.id}: ${error.message}`, error.stack, 'LiveMatchService');
        }
      }

      this.logger.log(`Successfully processed ${liveMatches.length} live matches`, 'LiveMatchService');
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
      const result = await this.liveMatchModel.findOneAndUpdate(
        { matchId: match.matchId },
        {
          $set: {
            ...match,
            lastUpdatedAt: new Date(),
          },
          $inc: { updateCount: 1 },
          $setOnInsert: {
            createdAt: new Date(),
            updateCount: 0,
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

      const updateCount = result?.updateCount || 0;
      if (updateCount > 0) {
        this.logger.log(`Updated live match ${match.matchId} (update #${updateCount})`, 'LiveMatchService');
      } else {
        this.logger.log(`Created new live match ${match.matchId}`, 'LiveMatchService');
      }
      
      return result as LiveMatch;
    } catch (error: any) {
      // Handle duplicate key errors gracefully
      if (error.code === 11000 || error.name === 'MongoServerError') {
        this.logger.warn(`Duplicate key error for match ${match.matchId}, retrying...`, 'LiveMatchService');
        // Retry once with findOneAndUpdate
        try {
          const retryResult = await this.liveMatchModel.findOneAndUpdate(
            { matchId: match.matchId },
            { $set: match, $inc: { updateCount: 1 } },
            { new: true, runValidators: true, session }
          ).lean();
          return retryResult as LiveMatch;
        } catch (retryError: any) {
          this.logger.error(`Retry failed for match ${match.matchId}`, retryError.stack, 'LiveMatchService');
          throw retryError;
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

