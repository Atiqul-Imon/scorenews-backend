import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { MatchTransitionService } from './match-transition.service';
import { LiveMatchService } from './live-match.service';
import { CompletedMatchService } from './completed-match.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

@Injectable()
export class MatchSchedulerService implements OnModuleInit {
  private transitionInterval: NodeJS.Timeout | null = null;
  private liveUpdateInterval: NodeJS.Timeout | null = null;
  private completedSyncInterval: NodeJS.Timeout | null = null;
  private footballLiveUpdateInterval: NodeJS.Timeout | null = null;
  private footballLiveMatchService: any = null;

  constructor(
    private matchTransitionService: MatchTransitionService,
    private liveMatchService: LiveMatchService,
    private completedMatchService: CompletedMatchService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Set football live match service (called from FootballModule)
   */
  setFootballLiveMatchService(service: any) {
    this.footballLiveMatchService = service;
    this.logger.log('Football live match service registered with scheduler', 'MatchSchedulerService');
  }

  async onModuleInit() {
    this.logger.log('Initializing match schedulers...', 'MatchSchedulerService');
    
    // Immediately fetch live matches on startup (don't wait for first interval)
    try {
      this.logger.log('Fetching initial live matches on startup...', 'MatchSchedulerService');
      await this.liveMatchService.fetchAndUpdateLiveMatches();
      this.logger.log('Initial cricket live matches fetched', 'MatchSchedulerService');
    } catch (error: any) {
      this.logger.error('Failed to fetch initial cricket live matches', error.stack, 'MatchSchedulerService');
    }
    
    // Fetch football live matches if service is available
    if (this.footballLiveMatchService) {
      try {
        this.logger.log('Fetching initial football live matches on startup...', 'MatchSchedulerService');
        await this.footballLiveMatchService.fetchAndUpdateLiveMatches();
        this.logger.log('Initial football live matches fetched', 'MatchSchedulerService');
      } catch (error: any) {
        this.logger.error('Failed to fetch initial football live matches', error.stack, 'MatchSchedulerService');
      }
    }
    
    // Start background schedulers
    this.startSchedulers();
  }

  /**
   * Start all background schedulers
   */
  private startSchedulers() {
    this.logger.log('Starting match schedulers...', 'MatchSchedulerService');

    // 1. Check for match transitions every 2 minutes (reduced frequency to avoid rate limiting)
    this.transitionInterval = setInterval(async () => {
      try {
        await this.matchTransitionService.processTransitions();
      } catch (error: any) {
        this.logger.error('Error in transition scheduler', error.stack, 'MatchSchedulerService');
      }
    }, 120000); // 2 minutes - reduced to avoid rate limiting

    // 2. Update cricket live matches every 30 seconds to reduce API calls and costs
    // Note: getMatchDetails is only called when user requests match details page, not during background updates
    // UI gets data from database via WebSocket broadcasts, not directly from API
    // This reduces API costs while maintaining real-time updates
    this.liveUpdateInterval = setInterval(async () => {
      try {
        await this.liveMatchService.fetchAndUpdateLiveMatches();
      } catch (error: any) {
        this.logger.error('Error in cricket live match update scheduler', error.stack, 'MatchSchedulerService');
      }
    }, 30000); // 30 seconds - reduces API calls while UI gets data from database

    // 3. Update football live matches every 30 seconds (same interval as cricket)
    if (this.footballLiveMatchService) {
      this.footballLiveUpdateInterval = setInterval(async () => {
        try {
          await this.footballLiveMatchService.fetchAndUpdateLiveMatches();
        } catch (error: any) {
          this.logger.error('Error in football live match update scheduler', error.stack, 'MatchSchedulerService');
        }
      }, 30000); // 30 seconds - same as cricket
    }

    // 4. Sync completed matches every hour
    this.completedSyncInterval = setInterval(async () => {
      try {
        await this.completedMatchService.fetchAndSaveCompletedMatches();
      } catch (error: any) {
        this.logger.error('Error in completed match sync scheduler', error.stack, 'MatchSchedulerService');
      }
    }, 3600000); // 1 hour

    this.logger.log('Match schedulers started successfully', 'MatchSchedulerService');
  }

  /**
   * Stop all schedulers (for graceful shutdown)
   */
  onModuleDestroy() {
    if (this.transitionInterval) {
      clearInterval(this.transitionInterval);
    }
    if (this.liveUpdateInterval) {
      clearInterval(this.liveUpdateInterval);
    }
    if (this.footballLiveUpdateInterval) {
      clearInterval(this.footballLiveUpdateInterval);
    }
    if (this.completedSyncInterval) {
      clearInterval(this.completedSyncInterval);
    }
    this.logger.log('Match schedulers stopped', 'MatchSchedulerService');
  }

  /**
   * Manually trigger transition check
   */
  async checkTransitions(): Promise<number> {
    return await this.matchTransitionService.processTransitions();
  }

  /**
   * Manually trigger live match update
   */
  async updateLiveMatches(): Promise<void> {
    await this.liveMatchService.fetchAndUpdateLiveMatches();
  }

  /**
   * Manually trigger completed match sync
   */
  async syncCompletedMatches(): Promise<void> {
    await this.completedMatchService.fetchAndSaveCompletedMatches();
  }
}



