import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { CricketController } from './cricket.controller';
import { CricketService } from './cricket.service';
import { LiveMatch, LiveMatchSchema } from './schemas/live-match.schema';
import { CompletedMatch, CompletedMatchSchema } from './schemas/completed-match.schema';
import { CricketTeam, CricketTeamSchema } from './schemas/cricket-team.schema';
import { LocalMatch, LocalMatchSchema } from './schemas/local-match.schema';
import { CricketApiService } from './services/cricket-api.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { CricketDataService } from './services/cricketdata.service';
import { LiveMatchService } from './services/live-match.service';
import { CompletedMatchService } from './services/completed-match.service';
import { MatchTransitionService } from './services/match-transition.service';
import { MatchSchedulerService } from './services/match-scheduler.service';
import { LocalMatchService } from './services/local-match.service';
import { RedisModule } from '../../redis/redis.module';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LiveMatch.name, schema: LiveMatchSchema },
      { name: CompletedMatch.name, schema: CompletedMatchSchema },
      { name: CricketTeam.name, schema: CricketTeamSchema },
      { name: LocalMatch.name, schema: LocalMatchSchema },
    ]),
    HttpModule,
    RedisModule,
    LoggerModule,
  ],
  controllers: [CricketController],
  providers: [
    CricketService,
    CricketApiService,
    SportsMonksService,
    CricketDataService,
    LiveMatchService,
    CompletedMatchService,
    MatchTransitionService,
    MatchSchedulerService,
    LocalMatchService,
  ],
  exports: [CricketService, LiveMatchService, CompletedMatchService, MatchTransitionService, MatchSchedulerService, LocalMatchService],
})
export class CricketModule {}

