import { Injectable, OnModuleInit } from '@nestjs/common';
import { MatchTransitionService } from './match-transition.service';
import { LiveMatchService } from './live-match.service';
import { CompletedMatchService } from './completed-match.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

@Injectable()
export class MatchSchedulerService implements OnModuleInit {
  private transitionInterval: NodeJS.Timeout | null = null;
  private liveUpdateInterval: NodeJS.Timeout | null = null;
  private completedSyncInterval: NodeJS.Timeout | null = null;

  constructor(
    private matchTransitionService: MatchTransitionService,
    private liveMatchService: LiveMatchService,
    private completedMatchService: CompletedMatchService,
    private logger: WinstonLoggerService,
  ) {}

  onModuleInit() {
    this.startSchedulers();
  }

  /**
   * Start all background schedulers
   */
  private startSchedulers() {
    this.logger.log('Starting match schedulers...', 'MatchSchedulerService');

    // 1. Check for match transitions every 30 seconds
    this.transitionInterval = setInterval(async () => {
      try {
        await this.matchTransitionService.processTransitions();
      } catch (error: any) {
        this.logger.error('Error in transition scheduler', error.stack, 'MatchSchedulerService');
      }
    }, 30000); // 30 seconds

    // 2. Update live matches every 60 seconds
    this.liveUpdateInterval = setInterval(async () => {
      try {
        await this.liveMatchService.fetchAndUpdateLiveMatches();
      } catch (error: any) {
        this.logger.error('Error in live match update scheduler', error.stack, 'MatchSchedulerService');
      }
    }, 60000); // 60 seconds

    // 3. Sync completed matches every hour
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


