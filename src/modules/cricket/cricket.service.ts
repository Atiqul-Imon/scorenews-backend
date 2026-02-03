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
        // Database has matches, trigger background update for next request
        this.liveMatchService.fetchAndUpdateLiveMatches().catch((err) => {
          this.logger.error('Background update of live matches failed', err.stack, 'CricketService');
        });
      }
      
      return {
        success: true,
        data: matches,
      };
    } catch (error: any) {
      this.logger.error('Error getting live matches', error.stack, 'CricketService');
      // Fallback: try to fetch from API
      try {
        const matches = await this.liveMatchService.fetchAndUpdateLiveMatches();
        return {
          success: true,
          data: matches,
        };
      } catch (fallbackError: any) {
        this.logger.error('Fallback fetch also failed', fallbackError.stack, 'CricketService');
        return {
          success: true,
          data: [],
        };
      }
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
   */
  async getMatchById(id: string) {
    try {
      // First check live matches
      const liveMatch = await this.liveMatchService.getLiveMatchById(id);
      if (liveMatch) {
        return {
          success: true,
          data: liveMatch,
        };
      }
      
      // Then check completed matches
      const completedMatch = await this.completedMatchService.getCompletedMatchById(id);
      if (completedMatch) {
        return {
          success: true,
          data: completedMatch,
        };
      }
      
      // If not found in either, fetch from API
      try {
        const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
        if (apiMatch) {
          // Determine status and save to appropriate collection
          const statusResult = determineMatchStatus(apiMatch);
          
          if (statusResult.status === 'live') {
            // Process single match instead of fetching all
            const processed = await this.liveMatchService.fetchAndUpdateLiveMatches();
            const match = processed.find(m => m.matchId === id) || await this.liveMatchService.getLiveMatchById(id);
            if (match) {
              return { success: true, data: match };
            }
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

