import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CricketMatch, CricketMatchDocument } from './schemas/cricket-match.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { CricketApiService } from './services/cricket-api.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { transformApiMatchToFrontend, transformSportsMonksMatchToFrontend } from './utils/match-transformers';
import { GetMatchesDto } from './dto/get-matches.dto';

@Injectable()
export class CricketService {
  constructor(
    @InjectModel(CricketMatch.name) private cricketMatchModel: Model<CricketMatchDocument>,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
    private configService: ConfigService,
    private cricketApiService: CricketApiService,
    private sportsMonksService: SportsMonksService,
  ) {}

  async getMatches(filters: GetMatchesDto) {
    const { page = 1, limit = 20, status, format, series, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (status) filter.status = status;
    if (format) filter.format = format;
    if (series) filter.series = new RegExp(series, 'i');
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }

    const cacheKey = `cricket_matches:${JSON.stringify(filter)}:${page}:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const matches = await this.cricketMatchModel
      .find(filter)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.cricketMatchModel.countDocuments(filter);

    const result = {
      matches,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  async getLiveMatches() {
    try {
      const cachedData = await this.redisService.get('live_cricket_matches');
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log('Fetching live cricket matches from SportsMonks...', 'CricketService');

      try {
        const apiMatches = await this.sportsMonksService.getLiveMatches('cricket');
        const transformedMatches = apiMatches.map((match: any) =>
          transformSportsMonksMatchToFrontend(match, 'cricket'),
        );
        const liveMatches = transformedMatches.filter((match) => match.status === 'live');

        const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
        await this.redisService.set('live_cricket_matches', JSON.stringify(liveMatches), cacheDuration);

        return liveMatches;
      } catch (sportsmonksError: any) {
        if (sportsmonksError.response?.status === 403) {
          this.logger.warn('SportsMonks cricket not available (403), falling back to Cricket Data API', 'CricketService');
          try {
            const cricketDataMatches = await this.cricketApiService.getLiveMatches();
            const transformedMatches = cricketDataMatches.map(transformApiMatchToFrontend);
            const liveMatches = transformedMatches.filter(
              (match) => match.status === 'live' || (match.matchStarted && !match.matchEnded),
            );

            const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
            await this.redisService.set('live_cricket_matches', JSON.stringify(liveMatches), cacheDuration);

            return liveMatches;
          } catch (cricketDataError) {
            this.logger.error('Both APIs failed, using database fallback', cricketDataError, 'CricketService');
            throw cricketDataError;
          }
        }
        throw sportsmonksError;
      }
    } catch (error: any) {
      this.logger.error('Error fetching live cricket matches', error.stack, 'CricketService');
      const dbMatches = await this.cricketMatchModel.find({ status: 'live' }).sort({ startTime: -1 }).lean();
      return dbMatches;
    }
  }

  async getFixtures(filters: GetMatchesDto) {
    const { page = 1, limit = 20, format, series, startDate, endDate } = filters;

    try {
      const cacheKey = `cricket_fixtures:${JSON.stringify(filters)}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log('Fetching upcoming cricket matches from SportsMonks...', 'CricketService');

      const apiMatches = await this.sportsMonksService.getUpcomingMatches('cricket');
      const transformedMatches = apiMatches.map((match: any) =>
        transformSportsMonksMatchToFrontend(match, 'cricket'),
      );

      const now = new Date();
      let filteredMatches = transformedMatches.filter((match) => {
        const matchDate = new Date(match.startTime);
        return match.status === 'upcoming' || (!match.matchStarted && !match.matchEnded && matchDate > now);
      });

      if (format) {
        filteredMatches = filteredMatches.filter((m) => m.format === format);
      }
      if (series) {
        const seriesRegex = new RegExp(series, 'i');
        filteredMatches = filteredMatches.filter((m) => m.series && seriesRegex.test(m.series));
      }
      if (startDate || endDate) {
        filteredMatches = filteredMatches.filter((m) => {
          const matchDate = new Date(m.startTime);
          if (startDate && matchDate < new Date(startDate)) return false;
          if (endDate && matchDate > new Date(endDate)) return false;
          return true;
        });
      }

      filteredMatches.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      const skip = (page - 1) * limit;
      const paginatedMatches = filteredMatches.slice(skip, skip + limit);
      const total = filteredMatches.length;

      const result = {
        fixtures: paginatedMatches,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      };

      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 300;
      await this.redisService.set(cacheKey, JSON.stringify(result), cacheDuration);

      return result;
    } catch (error: any) {
      this.logger.error('Error fetching fixtures from API', error.stack, 'CricketService');

      const skip = (page - 1) * limit;
      const filter: any = { status: 'upcoming' };
      if (format) filter.format = format;
      if (series) filter.series = new RegExp(series, 'i');
      if (startDate || endDate) {
        filter.startTime = {};
        if (startDate) filter.startTime.$gte = new Date(startDate);
        if (endDate) filter.startTime.$lte = new Date(endDate);
      }

      const fixtures = await this.cricketMatchModel
        .find(filter)
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await this.cricketMatchModel.countDocuments(filter);

      return {
        fixtures: fixtures || [],
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total: total || 0,
          limit,
        },
      };
    }
  }

  async getResults(filters: GetMatchesDto) {
    const { page = 1, limit = 20, format, series, startDate, endDate } = filters;

    try {
      const cacheKey = `cricket_results:${JSON.stringify(filters)}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log('Fetching completed cricket matches from SportsMonks...', 'CricketService');

      const apiMatches = await this.sportsMonksService.getCompletedMatches('cricket');
      const transformedMatches = apiMatches.map((match: any) =>
        transformSportsMonksMatchToFrontend(match, 'cricket'),
      );
      const completedMatches = transformedMatches.filter(
        (match) => match.status === 'completed' || match.matchEnded,
      );

      let filteredMatches = completedMatches;
      if (format) {
        filteredMatches = filteredMatches.filter((m) => m.format === format);
      }
      if (series) {
        const seriesRegex = new RegExp(series, 'i');
        filteredMatches = filteredMatches.filter((m) => m.series && seriesRegex.test(m.series));
      }
      if (startDate || endDate) {
        filteredMatches = filteredMatches.filter((m) => {
          const matchDate = new Date(m.startTime);
          if (startDate && matchDate < new Date(startDate)) return false;
          if (endDate && matchDate > new Date(endDate)) return false;
          return true;
        });
      }

      filteredMatches.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const skip = (page - 1) * limit;
      const paginatedMatches = filteredMatches.slice(skip, skip + limit);
      const total = filteredMatches.length;

      const result = {
        results: paginatedMatches,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      };

      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 3600 : 900;
      await this.redisService.set(cacheKey, JSON.stringify(result), cacheDuration);

      return result;
    } catch (error: any) {
      this.logger.error('Error fetching results from API', error.stack, 'CricketService');

      const skip = (page - 1) * limit;
      const filter: any = { status: 'completed' };
      if (format) filter.format = format;
      if (series) filter.series = new RegExp(series, 'i');
      if (startDate || endDate) {
        filter.startTime = {};
        if (startDate) filter.startTime.$gte = new Date(startDate);
        if (endDate) filter.startTime.$lte = new Date(endDate);
      }

      const results = await this.cricketMatchModel
        .find(filter)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await this.cricketMatchModel.countDocuments(filter);

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
      const cacheKey = `cricket_match:${id}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log(`Fetching cricket match details from SportsMonks for ${id}...`, 'CricketService');

      const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
      const transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');

      await this.redisService.set(cacheKey, JSON.stringify(transformedMatch), 60);

      return transformedMatch;
    } catch (error: any) {
      this.logger.error(`Error fetching match details for ${id}`, error.stack, 'CricketService');

      const match = await this.cricketMatchModel.findById(id).lean();

      if (!match) {
        throw new NotFoundException('Cricket match not found');
      }

      return match;
    }
  }

  async getCommentary(id: string) {
    try {
      const cacheKey = `cricket_commentary:${id}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      this.logger.log(`Fetching cricket commentary from SportsMonks for ${id}...`, 'CricketService');

      const commentary = await this.sportsMonksService.getCommentary(id, 'cricket');
      await this.redisService.set(cacheKey, JSON.stringify(commentary), 30);

      return commentary;
    } catch (error: any) {
      this.logger.error(`Error fetching commentary for ${id}`, error.stack, 'CricketService');
      return [];
    }
  }

  async getSeries(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const series = await this.cricketMatchModel.aggregate([
      {
        $group: {
          _id: '$series',
          count: { $sum: 1 },
          latestMatch: { $max: '$startTime' },
        },
      },
      { $sort: { latestMatch: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    return series;
  }

  async getPlayers(page: number = 1, limit: number = 20, query?: string) {
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query) {
      filter.$or = [
        { 'players.name': new RegExp(query, 'i') },
        { 'players.role': new RegExp(query, 'i') },
      ];
    }

    const players = await this.cricketMatchModel.aggregate([
      { $unwind: '$players' },
      { $match: filter },
      {
        $group: {
          _id: '$players.id',
          name: { $first: '$players.name' },
          role: { $first: '$players.role' },
          team: { $first: '$players.team' },
          totalRuns: { $sum: '$players.runs' },
          totalWickets: { $sum: '$players.wickets' },
          matchCount: { $sum: 1 },
        },
      },
      { $sort: { totalRuns: -1, totalWickets: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    return players;
  }

  async getStats() {
    const stats = await this.cricketMatchModel.aggregate([
      {
        $group: {
          _id: null,
          totalMatches: { $sum: 1 },
          liveMatches: {
            $sum: { $cond: [{ $eq: ['$status', 'live'] }, 1, 0] },
          },
          completedMatches: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          upcomingMatches: {
            $sum: { $cond: [{ $eq: ['$status', 'upcoming'] }, 1, 0] },
          },
          totalRuns: {
            $sum: { $add: ['$currentScore.home.runs', '$currentScore.away.runs'] },
          },
          totalWickets: {
            $sum: { $add: ['$currentScore.home.wickets', '$currentScore.away.wickets'] },
          },
        },
      },
    ]);

    return stats[0] || {};
  }
}
