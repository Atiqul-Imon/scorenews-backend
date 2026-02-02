import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { LiveMatchService } from './services/live-match.service';
import { CompletedMatchService } from './services/completed-match.service';
import { MatchTransitionService } from './services/match-transition.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { GetMatchesDto } from './dto/get-matches.dto';
import { determineMatchStatus } from './utils/status-determiner';

@Injectable()
export class CricketService {
  constructor(
    private liveMatchService: LiveMatchService,
    private completedMatchService: CompletedMatchService,
    private matchTransitionService: MatchTransitionService,
    private sportsMonksService: SportsMonksService,
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
      // Fetch and update from API in background
      this.liveMatchService.fetchAndUpdateLiveMatches().catch((err) => {
        this.logger.error('Background update of live matches failed', err.stack, 'CricketService');
      });
      
      // Return from database immediately
      const matches = await this.liveMatchService.getLiveMatches();
      
      return {
        success: true,
        data: matches,
      };
    } catch (error: any) {
      this.logger.error('Error getting live matches', error.stack, 'CricketService');
      // Fallback to database only
      const matches = await this.liveMatchService.getLiveMatches();
      return {
        success: true,
        data: matches,
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
            await this.liveMatchService.fetchAndUpdateLiveMatches();
            const match = await this.liveMatchService.getLiveMatchById(id);
            if (match) {
              return { success: true, data: match };
            }
          } else if (statusResult.status === 'completed') {
            await this.completedMatchService.fetchAndSaveCompletedMatches();
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
   * Get commentary for a match
   */
  async getCommentary(id: string) {
    try {
      const commentary = await this.sportsMonksService.getCommentary(id, 'cricket');
      return {
        success: true,
        data: commentary,
      };
    } catch (error: any) {
      this.logger.error(`Error getting commentary for match ${id}`, error.stack, 'CricketService');
      return {
        success: true,
        data: [],
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







