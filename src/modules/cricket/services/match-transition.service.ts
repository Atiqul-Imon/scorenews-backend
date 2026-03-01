import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { LiveMatchService } from './live-match.service';
import { CompletedMatchService } from './completed-match.service';
import { SportsMonksService } from './sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../utils/match-transformers';
import { parseApiResultNote } from '../utils/match-transformers';
import { determineMatchStatus, isCompleted } from '../utils/status-determiner';
import { isValidMatchId, sanitizeMatchId } from '../utils/validation';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';
import { CompletedMatch } from '../schemas/completed-match.schema';

@Injectable()
export class MatchTransitionService {
  constructor(
    @InjectConnection() private connection: Connection,
    private liveMatchService: LiveMatchService,
    private completedMatchService: CompletedMatchService,
    private sportsMonksService: SportsMonksService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Detect matches that have transitioned from live to completed
   * OPTIMIZED: First check /livescores endpoint to see which matches are still live
   * Only call getMatchDetails for matches not in /livescores (likely completed)
   */
  async detectTransitions(): Promise<string[]> {
    try {
      this.logger.log('Detecting match transitions...', 'MatchTransitionService');
      
      const liveMatches = await this.liveMatchService.getLiveMatches();
      if (liveMatches.length === 0) {
        this.logger.log('No live matches to check for transitions', 'MatchTransitionService');
        return [];
      }

      // OPTIMIZATION: First check /livescores endpoint to see which matches are still live
      // This is a single API call instead of N calls (one per match)
      let currentLiveMatchIds: Set<string> = new Set();
      try {
        const currentLiveMatches = await this.sportsMonksService.getLiveMatches('cricket');
        currentLiveMatchIds = new Set(currentLiveMatches.map((m: any) => m.id?.toString()));
        this.logger.log(`Found ${currentLiveMatchIds.size} matches currently in /livescores endpoint`, 'MatchTransitionService');
      } catch (error: any) {
        this.logger.warn(`Failed to fetch /livescores for transition check: ${error.message}. Will check each match individually.`, 'MatchTransitionService');
        // Fall back to individual checks if /livescores fails
      }

      const transitions: string[] = [];

      // Process matches one at a time with delays to avoid rate limiting
      for (let i = 0; i < liveMatches.length; i++) {
        const match = liveMatches[i];
        try {
          // Add delay between checks to avoid rate limiting (except for first match)
          if (i > 0) {
            // 3 second delay between each match check to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          // OPTIMIZATION: If match is still in /livescores, it's still live - skip getMatchDetails call
          if (currentLiveMatchIds.has(match.matchId)) {
            this.logger.log(`Match ${match.matchId} is still in /livescores, skipping transition check`, 'MatchTransitionService');
            continue;
          }
          
          // Match is not in /livescores - check if it's completed via getMatchDetails
          // This is the source of truth - always use API data, not manual calculations
          this.logger.log(`Match ${match.matchId} not found in /livescores, checking completion status...`, 'MatchTransitionService');
          const isMatchCompleted = await this.liveMatchService.checkMatchCompletion(match.matchId);
          
          if (isMatchCompleted) {
            transitions.push(match.matchId);
            this.logger.log(`Match ${match.matchId} detected for transition to completed (via SportsMonk API)`, 'MatchTransitionService');
          }
        } catch (error: any) {
          this.logger.error(`Error checking match ${match.matchId} for transition`, error.stack, 'MatchTransitionService');
          // Continue with next match even if this one fails
        }
      }

      this.logger.log(`Detected ${transitions.length} matches for transition`, 'MatchTransitionService');
      return transitions;
    } catch (error: any) {
      this.logger.error('Error detecting transitions', error.stack, 'MatchTransitionService');
      return [];
    }
  }

  /**
   * Migrate match from live to completed (atomic operation)
   */
  async migrateMatch(matchId: string): Promise<void> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      this.logger.log(`Starting migration for match ${matchId}`, 'MatchTransitionService');

      // Validate and sanitize matchId
      if (!isValidMatchId(matchId)) {
        this.logger.error(`Invalid matchId format for migration: ${matchId}`, '', 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      const sanitizedMatchId = sanitizeMatchId(matchId);
      if (!sanitizedMatchId) {
        this.logger.error(`Could not sanitize matchId: ${matchId}`, '', 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // Use sanitized matchId for all operations
      matchId = sanitizedMatchId;

      // 1. Get live match
      const liveMatch = await this.liveMatchService.getLiveMatchById(matchId);
      if (!liveMatch) {
        this.logger.warn(`Live match ${matchId} not found, skipping migration`, 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // 2. Fetch full details from API with retry
      let apiMatch: any = null;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          apiMatch = await this.sportsMonksService.getMatchDetails(matchId, 'cricket');
          if (apiMatch) break;
          
          if (attempt < maxRetries) {
            this.logger.warn(`API returned null for match ${matchId}, retrying... (attempt ${attempt + 1}/${maxRetries + 1})`, 'MatchTransitionService');
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        } catch (error: any) {
          if (attempt < maxRetries) {
            this.logger.warn(`Error fetching API data for match ${matchId}, retrying... (attempt ${attempt + 1}/${maxRetries + 1})`, 'MatchTransitionService');
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          } else {
            this.logger.error(`Could not fetch API data for match ${matchId} after ${maxRetries + 1} attempts`, error.stack, 'MatchTransitionService');
            await session.abortTransaction();
            return;
          }
        }
      }

      if (!apiMatch) {
        this.logger.error(`Could not fetch API data for match ${matchId} after retries`, '', 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // 3. Verify it's completed
      const statusResult = determineMatchStatus(apiMatch);
      if (statusResult.status !== 'completed' || statusResult.confidence !== 'high') {
        this.logger.warn(`Match ${matchId} is not completed: ${statusResult.reason}`, 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // 4. Transform to frontend format
      const transformed = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
      if (!transformed || !transformed.matchId) {
        this.logger.error(`Transformation failed for match ${matchId}`, '', 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // 5. Parse result from API only (never calculate locally)
      // Result must come from API: either from transformed.result or from parsing API note field
      let result = transformed.result;
      
      // If not in transformed result, try parsing from API note field (this is still API data)
      if (!result && apiMatch.note && apiMatch.winner_team_id) {
        result = parseApiResultNote(
          apiMatch.note,
          apiMatch.winner_team_id,
          apiMatch.localteam_id,
          apiMatch.visitorteam_id,
          transformed.teams
        );
        if (result) {
          result.dataSource = 'api'; // Parsed from API note, so it's from API
        }
      }

      // CRITICAL: Never calculate result locally - only use API-provided data
      // If API doesn't provide result, we cannot complete the migration
      if (!result) {
        this.logger.error(
          `Cannot migrate match ${matchId}: API did not provide result. ` +
          `Required fields: winner_team_id=${apiMatch.winner_team_id}, note="${apiMatch.note?.substring(0, 100)}"`,
          '',
          'MatchTransitionService'
        );
        await session.abortTransaction();
        return;
      }
      
      // Ensure result is marked as from API (never calculated)
      result.dataSource = 'api';

      // Validate result structure
      if (!result.winner || !result.winnerName || result.margin === undefined) {
        this.logger.error(`Invalid result structure for match ${matchId}`, '', 'MatchTransitionService');
        await session.abortTransaction();
        return;
      }

      // 6. Create CompletedMatch
      const finalScore = {
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
      };

      const completedMatch: CompletedMatch = {
        matchId: transformed.matchId,
        series: transformed.series,
        teams: transformed.teams,
        venue: transformed.venue,
        format: transformed.format,
        startTime: transformed.startTime,
        endTime: transformed.endTime || new Date(),
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
        apiNote: apiMatch.note || transformed.apiNote,
        round: transformed.round,
        tossWon: transformed.tossWon,
        elected: transformed.elected,
        manOfMatchId: apiMatch.man_of_match_id?.toString(),
        manOfSeriesId: apiMatch.man_of_series_id?.toString(),
        totalOversPlayed: apiMatch.total_overs_played,
        superOver: apiMatch.super_over || false,
        followOn: apiMatch.follow_on || false,
        drawNoResult: apiMatch.draw_noresult || false,
        dataSource: 'api', // Always from API, never calculated
        apiFetchedAt: new Date(),
        isCompleteData: true,
      };

      // 7. Save completed match (within transaction - pass session)
      await this.completedMatchService.saveOrUpdateCompletedMatch(completedMatch, session);

      // 8. Delete live match (within transaction - pass session)
      const deleted = await this.liveMatchService.deleteLiveMatch(matchId, session);
      if (!deleted) {
        this.logger.warn(`Live match ${matchId} was not found during migration`, 'MatchTransitionService');
        // Continue anyway - match might have been deleted already
      }

      // 9. Commit transaction
      await session.commitTransaction();
      
      this.logger.log(`Successfully migrated match ${matchId} from live to completed`, 'MatchTransitionService');
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Error migrating match ${matchId}`, error.stack, 'MatchTransitionService');
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Process all detected transitions
   */
  async processTransitions(): Promise<number> {
    try {
      const matchIds = await this.detectTransitions();
      let successCount = 0;

      for (const matchId of matchIds) {
        try {
          await this.migrateMatch(matchId);
          successCount++;
        } catch (error: any) {
          this.logger.error(`Failed to migrate match ${matchId}`, error.stack, 'MatchTransitionService');
        }
      }

      this.logger.log(`Processed ${successCount}/${matchIds.length} transitions successfully`, 'MatchTransitionService');
      return successCount;
    } catch (error: any) {
      this.logger.error('Error processing transitions', error.stack, 'MatchTransitionService');
      return 0;
    }
  }

  /**
   * Cleanup stale live matches (older than 24 hours)
   * Note: TTL index handles this automatically, but this can be used for manual cleanup
   */
  async cleanupStaleLiveMatches(): Promise<number> {
    try {
      // TTL index automatically deletes documents after expiresAt
      // This method is kept for manual cleanup if needed
      this.logger.log('TTL index automatically handles stale live match cleanup', 'MatchTransitionService');
      return 0;
    } catch (error: any) {
      this.logger.error('Error cleaning up stale live matches', error.stack, 'MatchTransitionService');
      return 0;
    }
  }
}


