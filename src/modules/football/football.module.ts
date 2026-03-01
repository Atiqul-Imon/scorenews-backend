import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { FootballController } from './football.controller';
import { FootballService } from './football.service';
import { FootballMatch, FootballMatchSchema } from './schemas/football-match.schema';
import { FootballLiveMatchService } from './services/football-live-match.service';
import { SportsMonksService } from '../cricket/services/sportsmonks.service';
import { CricketModule } from '../cricket/cricket.module';
import { MatchSchedulerService } from '../cricket/services/match-scheduler.service';
import { RedisModule } from '../../redis/redis.module';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FootballMatch.name, schema: FootballMatchSchema }]),
    HttpModule,
    RedisModule,
    LoggerModule,
    forwardRef(() => CricketModule), // Import CricketModule to access scheduler
  ],
  controllers: [FootballController],
  providers: [
    FootballService,
    FootballLiveMatchService,
    SportsMonksService,
    {
      provide: 'FOOTBALL_SCHEDULER_INIT',
      useFactory: (footballLiveMatchService: FootballLiveMatchService, scheduler: MatchSchedulerService) => {
        // Register football service with scheduler
        scheduler.setFootballLiveMatchService(footballLiveMatchService);
        return true;
      },
      inject: [FootballLiveMatchService, MatchSchedulerService],
    },
  ],
  exports: [FootballService, FootballLiveMatchService],
})
export class FootballModule implements OnModuleInit {
  constructor(
    private footballLiveMatchService: FootballLiveMatchService,
    private scheduler: MatchSchedulerService,
  ) {}

  onModuleInit() {
    // Register football service with scheduler after module initialization
    this.scheduler.setFootballLiveMatchService(this.footballLiveMatchService);
  }
}

