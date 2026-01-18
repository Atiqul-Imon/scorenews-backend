import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FootballController } from './football.controller';
import { FootballService } from './football.service';
import { FootballMatch, FootballMatchSchema } from './schemas/football-match.schema';
import { SportsMonksService } from '../cricket/services/sportsmonks.service';
import { RedisModule } from '../../redis/redis.module';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FootballMatch.name, schema: FootballMatchSchema }]),
    RedisModule,
    LoggerModule,
  ],
  controllers: [FootballController],
  providers: [FootballService, SportsMonksService],
  exports: [FootballService],
})
export class FootballModule {}

