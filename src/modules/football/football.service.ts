import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { FootballMatch, FootballMatchDocument } from './schemas/football-match.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { SportsMonksService } from '../cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../cricket/utils/match-transformers';

@Injectable()
export class FootballService {
  constructor(
    @InjectModel(FootballMatch.name) private footballMatchModel: Model<FootballMatchDocument>,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
    private configService: ConfigService,
    private sportsMonksService: SportsMonksService,
  ) {}

  async getLiveMatches() {
    try {
      const cachedData = await this.redisService.get('live_football_matches');
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log('Fetching live football matches from SportsMonks...', 'FootballService');

      const apiMatches = await this.sportsMonksService.getLiveMatches('football');
      const transformedMatches = apiMatches.map((match: any) =>
        transformSportsMonksMatchToFrontend(match, 'football'),
      );
      const liveMatches = transformedMatches.filter((match) => match.status === 'live');

      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
      await this.redisService.set('live_football_matches', JSON.stringify(liveMatches), cacheDuration);

      return liveMatches;
    } catch (error: any) {
      this.logger.error('Error fetching live football matches', error.stack, 'FootballService');
      const dbMatches = await this.footballMatchModel.find({ status: 'live' }).sort({ startTime: -1 }).lean();
      return dbMatches;
    }
  }

  async getFixtures(page: number = 1, limit: number = 20, league?: string, season?: string) {
    const skip = (page - 1) * limit;
    const filter: any = { status: 'scheduled' };
    if (league) filter.league = new RegExp(league, 'i');
    if (season) filter.season = season;

    const fixtures = await this.footballMatchModel
      .find(filter)
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.footballMatchModel.countDocuments(filter);

    return {
      fixtures,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }

  async getResults(page: number = 1, limit: number = 20) {
    try {
      const cacheKey = `football_results:${page}:${limit}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log('Fetching completed football matches from SportsMonks...', 'FootballService');

      const apiMatches = await this.sportsMonksService.getCompletedMatches('football');
      const transformedMatches = apiMatches.map((match: any) =>
        transformSportsMonksMatchToFrontend(match, 'football'),
      );
      const completedMatches = transformedMatches.filter((match) => match.status === 'completed');

      const skip = (page - 1) * limit;
      const paginatedMatches = completedMatches.slice(skip, skip + limit);
      const total = completedMatches.length;

      const result = {
        results: paginatedMatches,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      };

      await this.redisService.set(cacheKey, JSON.stringify(result), 3600);
      return result;
    } catch (error: any) {
      this.logger.error('Error fetching results from API', error.stack, 'FootballService');

      const skip = (page - 1) * limit;
      const results = await this.footballMatchModel
        .find({ status: 'finished' })
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await this.footballMatchModel.countDocuments({ status: 'finished' });

      return {
        results: results || [],
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total: total || 0,
          limit,
        },
      };
    }
  }

  async getMatchById(id: string) {
    try {
      const cacheKey = `football_match:${id}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log(`Fetching football match details from SportsMonks for ${id}...`, 'FootballService');

      const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'football');
      const transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'football');

      await this.redisService.set(cacheKey, JSON.stringify(transformedMatch), 60);

      return transformedMatch;
    } catch (error: any) {
      this.logger.error(`Error fetching match details for ${id}`, error.stack, 'FootballService');

      const match = await this.footballMatchModel.findById(id).lean();

      if (!match) {
        throw new NotFoundException('Football match not found');
      }

      return match;
    }
  }
}
