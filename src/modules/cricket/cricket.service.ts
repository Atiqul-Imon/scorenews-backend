import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CricketMatch, CricketMatchDocument } from './schemas/cricket-match.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { CricketApiService } from './services/cricket-api.service';
import { SportsMonksService } from './services/sportsmonks.service';
import { CricketDataService } from './services/cricketdata.service';
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
    private cricketDataService: CricketDataService,
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

  async getLiveMatches(bypassCache: boolean = false) {
    try {
      // For live matches, always bypass cache if requested (for real-time updates)
      if (!bypassCache) {
        const cachedData = await this.redisService.get('live_cricket_matches');
        // Only use cache if it has actual live matches (not empty)
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
          // If cache has empty array, delete it and fetch fresh data
          await this.redisService.del('live_cricket_matches');
        }
      } else {
        // Bypass cache - delete it to force fresh fetch
        await this.redisService.del('live_cricket_matches');
      }

      // Try SportMonks first (primary - user has token)
      const sportMonksToken = this.configService.get<string>('SPORTMONKS_API_TOKEN');
      if (sportMonksToken) {
        try {
          this.logger.log('Fetching live cricket matches from SportMonks...', 'CricketService');
          const apiMatches = await this.sportsMonksService.getLiveMatches('cricket');
          const transformedMatches = apiMatches.map((match: any) =>
            transformSportsMonksMatchToFrontend(match, 'cricket'),
          );
          const liveMatches = transformedMatches.filter((match) => match.status === 'live');

          if (liveMatches.length > 0) {
            // Short cache for live matches - scores update frequently
            // Only cache if not bypassing (for real-time updates)
            if (!bypassCache) {
              const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 15 : 10; // 15s prod, 10s dev
              await this.redisService.set('live_cricket_matches', JSON.stringify(liveMatches), cacheDuration);
            }
            return liveMatches;
          }
        } catch (sportsmonksError: any) {
          if (sportsmonksError.response?.status === 403) {
            this.logger.warn('SportMonks cricket not available (403), trying fallback APIs...', 'CricketService');
          } else {
            this.logger.warn('SportMonks failed, trying fallback APIs...', 'CricketService');
          }
        }
      }

      // Fallback to CricketData.org (if configured)
      const cricketDataApiKey = this.configService.get<string>('CRICKETDATA_API_KEY');
      if (cricketDataApiKey) {
        try {
          this.logger.log('Fetching live cricket matches from CricketData.org...', 'CricketService');
          const apiMatches = await this.cricketDataService.getLiveMatches();
          const transformedMatches = apiMatches.map((match: any) =>
            transformApiMatchToFrontend(match),
          );
          const liveMatches = transformedMatches.filter(
            (match) => match.status === 'live' || (match.matchStarted && !match.matchEnded),
          );

          if (liveMatches.length > 0) {
            // Only cache if not bypassing (for real-time updates)
            if (!bypassCache) {
              const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 30 : 15;
              await this.redisService.set('live_cricket_matches', JSON.stringify(liveMatches), cacheDuration);
            }
            return liveMatches;
          }
        } catch (cricketDataError: any) {
          this.logger.warn('CricketData.org failed, trying CricAPI...', 'CricketService');
        }
      }

      // Final fallback to CricAPI
      try {
        const cricketDataMatches = await this.cricketApiService.getLiveMatches();
        const transformedMatches = cricketDataMatches.map(transformApiMatchToFrontend);
        const liveMatches = transformedMatches.filter(
          (match) => match.status === 'live' || (match.matchStarted && !match.matchEnded),
        );

        if (liveMatches.length > 0) {
          // Only cache if not bypassing (for real-time updates)
          if (!bypassCache) {
            const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
            await this.redisService.set('live_cricket_matches', JSON.stringify(liveMatches), cacheDuration);
          }
          return liveMatches;
        }
      } catch (cricketApiError) {
        this.logger.error('All APIs failed, using database fallback', cricketApiError, 'CricketService');
      }

      // Final fallback: database
      const dbMatches = await this.cricketMatchModel.find({ status: 'live' }).sort({ startTime: -1 }).lean();
      return dbMatches;
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

      // Only use cache if it has actual fixtures (not empty)
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed.fixtures && parsed.fixtures.length > 0) {
          return parsed;
        }
        // If cache has empty fixtures, delete it and fetch fresh data
        await this.redisService.del(cacheKey);
      }

      this.logger.log('Fetching upcoming cricket matches from SportsMonks...', 'CricketService');

      let apiMatches: any[] = [];
      try {
        apiMatches = await this.sportsMonksService.getUpcomingMatches('cricket');
      } catch (error: any) {
        this.logger.warn('SportMonks upcoming matches failed, using demo data', 'CricketService');
      }

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

      // If no matches from API, add demo upcoming matches for demo purposes
      if (filteredMatches.length === 0) {
        const demoMatches = this.getDemoUpcomingMatches();
        filteredMatches = demoMatches;
        this.logger.log('No upcoming matches from API, using demo data for demo purposes', 'CricketService');
      }

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

      // Only use cache if it has actual results (not empty)
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed.results && parsed.results.length > 0) {
          return parsed;
        }
        // If cache has empty results, delete it and fetch fresh data
        await this.redisService.del(cacheKey);
      }

      this.logger.log('Fetching completed cricket matches from SportsMonks...', 'CricketService');

      let apiMatches: any[] = [];
      try {
        apiMatches = await this.sportsMonksService.getCompletedMatches('cricket');
      } catch (error: any) {
        this.logger.warn('SportMonks completed matches failed, using demo data', 'CricketService');
      }

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

      // If no matches from API, add demo completed matches for demo purposes
      if (filteredMatches.length === 0) {
        const demoMatches = this.getDemoCompletedMatches();
        filteredMatches = demoMatches;
        this.logger.log('No completed matches from API, using demo data for demo purposes', 'CricketService');
      }

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

      // Only use cache if it has actual data (not empty)
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed && Object.keys(parsed).length > 0) {
          return parsed;
        }
        // If cache has empty data, delete it and fetch fresh
        await this.redisService.del(cacheKey);
      }

      this.logger.log(`Fetching cricket match details from SportsMonks for ${id}...`, 'CricketService');

      const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
      const transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');

      // Cache for 60 seconds for live matches, 3600 for completed
      const cacheDuration = transformedMatch.status === 'live' ? 60 : 3600;
      await this.redisService.set(cacheKey, JSON.stringify(transformedMatch), cacheDuration);

      return transformedMatch;
    } catch (error: any) {
      this.logger.error(`Error fetching match details for ${id}`, error.stack, 'CricketService');

      // Fallback to database - try both matchId and _id
      let match = await this.cricketMatchModel.findOne({ matchId: id }).lean();
      
      if (!match) {
        // Try finding by _id if id looks like MongoDB ObjectId
        try {
          match = await this.cricketMatchModel.findById(id).lean();
        } catch (e) {
          // Ignore ObjectId cast errors
        }
      }

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

  /**
   * Demo completed matches for demo purposes when API returns empty
   */
  private getDemoCompletedMatches(): any[] {
    const now = new Date();
    return [
      {
        _id: 'demo-completed-1',
        matchId: 'demo-completed-1',
        teams: {
          home: { id: 'india', name: 'India', shortName: 'IND', flag: '🇮🇳' },
          away: { id: 'australia', name: 'Australia', shortName: 'AUS', flag: '🇦🇺' },
        },
        status: 'completed',
        format: 'ODI',
        series: 'ICC World Cup 2024',
        startTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        currentScore: {
          home: { runs: 285, wickets: 7, overs: 50.0 },
          away: { runs: 245, wickets: 10, overs: 48.2 },
        },
        venue: { name: 'Melbourne Cricket Ground', city: 'Melbourne', country: 'Australia' },
        matchEnded: true,
        matchStarted: true,
      },
      {
        _id: 'demo-completed-2',
        matchId: 'demo-completed-2',
        teams: {
          home: { id: 'england', name: 'England', shortName: 'ENG', flag: '🏴' },
          away: { id: 'pakistan', name: 'Pakistan', shortName: 'PAK', flag: '🇵🇰' },
        },
        status: 'completed',
        format: 'T20I',
        series: 'T20 World Cup 2024',
        startTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        currentScore: {
          home: { runs: 198, wickets: 4, overs: 20.0 },
          away: { runs: 175, wickets: 8, overs: 20.0 },
        },
        venue: { name: 'Lord\'s Cricket Ground', city: 'London', country: 'England' },
        matchEnded: true,
        matchStarted: true,
      },
      {
        _id: 'demo-completed-3',
        matchId: 'demo-completed-3',
        teams: {
          home: { id: 'new-zealand', name: 'New Zealand', shortName: 'NZ', flag: '🇳🇿' },
          away: { id: 'south-africa', name: 'South Africa', shortName: 'SA', flag: '🇿🇦' },
        },
        status: 'completed',
        format: 'ODI',
        series: 'ICC World Cup 2024',
        startTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        currentScore: {
          home: { runs: 312, wickets: 6, overs: 50.0 },
          away: { runs: 298, wickets: 9, overs: 50.0 },
        },
        venue: { name: 'Eden Park', city: 'Auckland', country: 'New Zealand' },
        matchEnded: true,
        matchStarted: true,
      },
      {
        _id: 'demo-completed-4',
        matchId: 'demo-completed-4',
        teams: {
          home: { id: 'bangladesh', name: 'Bangladesh', shortName: 'BAN', flag: '🇧🇩' },
          away: { id: 'sri-lanka', name: 'Sri Lanka', shortName: 'SL', flag: '🇱🇰' },
        },
        status: 'completed',
        format: 'T20I',
        series: 'Asia Cup 2024',
        startTime: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        currentScore: {
          home: { runs: 165, wickets: 5, overs: 20.0 },
          away: { runs: 142, wickets: 10, overs: 18.3 },
        },
        venue: { name: 'Sher-e-Bangla National Stadium', city: 'Dhaka', country: 'Bangladesh' },
        matchEnded: true,
        matchStarted: true,
      },
    ];
  }

  /**
   * Demo upcoming matches for demo purposes when API returns empty
   */
  private getDemoUpcomingMatches(): any[] {
    const now = new Date();
    return [
      {
        _id: 'demo-upcoming-1',
        matchId: 'demo-upcoming-1',
        teams: {
          home: { id: 'india', name: 'India', shortName: 'IND', flag: '🇮🇳' },
          away: { id: 'england', name: 'England', shortName: 'ENG', flag: '🏴' },
        },
        status: 'upcoming',
        format: 'ODI',
        series: 'ICC World Cup 2024',
        startTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        venue: { name: 'Wankhede Stadium', city: 'Mumbai', country: 'India' },
        matchEnded: false,
        matchStarted: false,
      },
      {
        _id: 'demo-upcoming-2',
        matchId: 'demo-upcoming-2',
        teams: {
          home: { id: 'australia', name: 'Australia', shortName: 'AUS', flag: '🇦🇺' },
          away: { id: 'south-africa', name: 'South Africa', shortName: 'SA', flag: '🇿🇦' },
        },
        status: 'upcoming',
        format: 'T20I',
        series: 'T20 World Cup 2024',
        startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        venue: { name: 'Sydney Cricket Ground', city: 'Sydney', country: 'Australia' },
        matchEnded: false,
        matchStarted: false,
      },
      {
        _id: 'demo-upcoming-3',
        matchId: 'demo-upcoming-3',
        teams: {
          home: { id: 'pakistan', name: 'Pakistan', shortName: 'PAK', flag: '🇵🇰' },
          away: { id: 'new-zealand', name: 'New Zealand', shortName: 'NZ', flag: '🇳🇿' },
        },
        status: 'upcoming',
        format: 'ODI',
        series: 'ICC World Cup 2024',
        startTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        venue: { name: 'Gaddafi Stadium', city: 'Lahore', country: 'Pakistan' },
        matchEnded: false,
        matchStarted: false,
      },
      {
        _id: 'demo-upcoming-4',
        matchId: 'demo-upcoming-4',
        teams: {
          home: { id: 'west-indies', name: 'West Indies', shortName: 'WI', flag: '🏝️' },
          away: { id: 'bangladesh', name: 'Bangladesh', shortName: 'BAN', flag: '🇧🇩' },
        },
        status: 'upcoming',
        format: 'T20I',
        series: 'T20 World Cup 2024',
        startTime: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        venue: { name: 'Kensington Oval', city: 'Bridgetown', country: 'Barbados' },
        matchEnded: false,
        matchStarted: false,
      },
    ];
  }
}
