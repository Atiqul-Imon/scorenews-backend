import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { CricketController } from './cricket.controller';
import { CricketService } from './cricket.service';
import { CricketMatch, CricketMatchSchema } from './schemas/cricket-match.schema';
import { CricketTeam, CricketTeamSchema } from './schemas/cricket-team.schema';
import { CricketApiService } from './services/cricket-api.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { RedisModule } from '../../redis/redis.module';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CricketMatch.name, schema: CricketMatchSchema },
      { name: CricketTeam.name, schema: CricketTeamSchema },
    ]),
    HttpModule,
    RedisModule,
    LoggerModule,
  ],
  controllers: [CricketController],
  providers: [CricketService, CricketApiService, SportsMonksService],
  exports: [CricketService],
})
export class CricketModule {}

