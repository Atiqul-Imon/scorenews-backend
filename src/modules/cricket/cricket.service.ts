import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { LiveMatchService } from './services/live-match.service';
import { CompletedMatchService } from './services/completed-match.service';
import { MatchTransitionService } from './services/match-transition.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { CommentaryService } from './services/commentary.service';
import { GetMatchesDto } from './dto/get-matches.dto';
import { determineMatchStatus } from './utils/status-determiner';

@Injectable()
export class CricketService {
  constructor(
    private liveMatchService: LiveMatchService,
    private completedMatchService: CompletedMatchService,
    private matchTransitionService: MatchTransitionService,
    private sportsMonksService: SportsMonksService,
    private commentaryService: CommentaryService,
    private logger: WinstonLoggerService,
    private configService: ConfigService,
  ) {}

  /**
   * Get all matches (deprecated - use getLiveMatches or getResults instead)
   */
  async getMatches(filters: GetMatchesDto) {
    // For backward compatibility, combine live and completed
    const [liveMatches, completedResult] = await Promise.all([
      this.liveMatchService.getLiveMatches(),
      this.completedMatchService.getCompletedMatches(filters),
    ]);

    return {
      matches: [...liveMatches, ...completedResult.matches],
      pagination: completedResult.pagination,
    };
  }

  /**
   * Get live matches
   */
  async getLiveMatches() {
    try {
      // First check database
      let matches = await this.liveMatchService.getLiveMatches();
      
      // If database is empty, fetch immediately from API (first request after cleanup)
      if (matches.length === 0) {
        this.logger.log('Database is empty, fetching live matches from API immediately...', 'CricketService');
        try {
          matches = await this.liveMatchService.fetchAndUpdateLiveMatches();
          this.logger.log(`Fetched ${matches.length} live matches from API`, 'CricketService');
        } catch (apiError: any) {
          this.logger.error('Failed to fetch live matches from API', apiError.stack, 'CricketService');
          // Return empty array if API fails
          return {
            success: true,
            data: [],
          };
        }
      } else {
        // Database has matches - scheduler handles updates, don't trigger API calls from user requests
        // This prevents rate limiting when multiple users access the site
        this.logger.log(`Returning ${matches.length} live matches from database (scheduler handles updates)`, 'CricketService');
      }
      
      return {
        success: true,
        data: matches,
      };
    } catch (error: any) {
      this.logger.error('Error getting live matches', error.stack, 'CricketService');
      // Don't fallback to API - scheduler handles updates
      // Return empty array to avoid rate limiting
      return {
        success: true,
        data: [],
      };
    }
  }

  /**
   * Get completed matches (results)
   */
  async getResults(filters: GetMatchesDto) {
    try {
      // First check database
      const dbResult = await this.completedMatchService.getCompletedMatches(filters);
      
      // If we have matches in database, return them
      if (dbResult.matches.length > 0) {
        return {
          success: true,
          data: dbResult,
        };
      }
      
      // If no matches in database, fetch from API
      await this.completedMatchService.fetchAndSaveCompletedMatches();
      
      // Return from database after fetching
      const result = await this.completedMatchService.getCompletedMatches(filters);
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error('Error getting results', error.stack, 'CricketService');
      // Fallback to database only
      const result = await this.completedMatchService.getCompletedMatches(filters);
      return {
        success: true,
        data: result,
      };
    }
  }

  /**
   * Get match by ID - checks both live and completed matches
   * For live matches, fetches fresh data from API to ensure latest scores
   */
  async getMatchById(id: string) {
    try {
      // First check database for quick response
      const liveMatch = await this.liveMatchService.getLiveMatchById(id);
      if (liveMatch) {
        // Return match from database - scheduler handles updates to avoid rate limiting
        // Don't trigger API calls from user requests
        return {
          success: true,
          data: liveMatch,
        };
      }
      
      // Check completed matches
      const completedMatch = await this.completedMatchService.getCompletedMatchById(id);
      if (completedMatch) {
        return {
          success: true,
          data: completedMatch,
        };
      }
      
      // If not found in database, fetch from API
      try {
        const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
        if (apiMatch) {
          // Determine status and save to appropriate collection
          const statusResult = determineMatchStatus(apiMatch);
          
          if (statusResult.status === 'live') {
            // Match is live but not in database - scheduler will pick it up
            // Don't fetch all live matches here to avoid rate limiting
            // Just return the API match data directly
            this.logger.warn(`Match ${id} is live but not in database - scheduler will add it`, 'CricketService');
            // Return API match directly (transformed if needed)
            return { success: true, data: apiMatch };
          } else if (statusResult.status === 'completed') {
            // Use getCompletedMatchById which handles single match fetch efficiently
            const match = await this.completedMatchService.getCompletedMatchById(id);
            if (match) {
              return { success: true, data: match };
            }
          }
        }
      } catch (apiError: any) {
        this.logger.error(`Error fetching match ${id} from API`, apiError.stack, 'CricketService');
      }
      
      throw new NotFoundException(`Match ${id} not found`);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error getting match ${id}`, error.stack, 'CricketService');
      throw new NotFoundException(`Match ${id} not found`);
    }
  }

  /**
   * Get fixtures (upcoming matches) - placeholder
   */
  async getFixtures(filters: GetMatchesDto) {
    // TODO: Implement fixtures endpoint
    return {
      success: true,
      data: {
        fixtures: [],
        pagination: {
          current: 1,
          pages: 0,
          total: 0,
          limit: filters.limit || 20,
        },
      },
    };
  }

  /**
   * Get commentary for a match (merged with in-house commentary)
   */
  async getCommentary(id: string, merge: boolean = true) {
    try {
      if (merge) {
        // Return merged commentary (SportsMonk + in-house)
        const merged = await this.commentaryService.mergeCommentary(id);
        return {
          success: true,
          data: merged,
        };
      } else {
        // Return only SportsMonk commentary (backward compatibility)
        const commentary = await this.sportsMonksService.getCommentary(id, 'cricket');
        return {
          success: true,
          data: commentary,
        };
      }
    } catch (error: any) {
      this.logger.error(`Error getting commentary for match ${id}`, error.stack, 'CricketService');
      return {
        success: true,
        data: {
          firstInnings: [],
          secondInnings: [],
          all: [],
          sources: { sportsMonk: 0, inHouse: 0 },
        },
      };
    }
  }

  /**
   * Get series list - placeholder
   */
  async getSeries(page: number = 1, limit: number = 20) {
    return {
      success: true,
      data: {
        series: [],
        pagination: {
          current: page,
          pages: 0,
          total: 0,
          limit,
        },
      },
    };
  }

  /**
   * Get players - placeholder
   */
  async getPlayers(page: number = 1, limit: number = 20, query?: string) {
    return {
      success: true,
      data: {
        players: [],
        pagination: {
          current: page,
          pages: 0,
          total: 0,
          limit,
        },
      },
    };
  }

  /**
   * Get stats - placeholder
   */
  async getStats() {
    return {
      success: true,
      data: {},
    };
  }

  /**
   * Get team matches - placeholder
   */
  async getTeamMatches(teamName: string) {
    return {
      success: true,
      data: {
        matches: [],
      },
    };
  }
}

