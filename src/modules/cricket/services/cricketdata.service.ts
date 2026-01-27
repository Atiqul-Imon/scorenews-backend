import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../../redis/redis.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

/**
 * CricketData.org API Service
 * 
 * Most comprehensive cricket API with:
 * - Live scores with ball-by-ball updates
 * - Commentary
 * - Player statistics
 * - Series information
 * - Historical data
 * 
 * Free tier: 100 requests/day
 * Website: https://www.cricketdata.org/
 */
@Injectable()
export class CricketDataService {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'CRICKETDATA_BASE_URL',
      'https://api.cricketdata.org/v1',
    );
    this.apiKey = this.configService.get<string>('CRICKETDATA_API_KEY', '');
  }

  /**
   * Get live cricket matches
   */
  async getLiveMatches(): Promise<any[]> {
    try {
      const cacheKey = 'cricketdata:live_matches';
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: {
            apikey: this.apiKey,
            status: 'live',
          },
        }),
      );

      const matches = response.data?.data || response.data || [];
      
      // Cache for 30 seconds (live data updates frequently)
      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 30 : 15;
      await this.redisService.set(cacheKey, JSON.stringify(matches), cacheDuration);

      return matches;
    } catch (error: any) {
      this.logger.error(
        'Error fetching live cricket matches from CricketData',
        error.stack,
        'CricketDataService',
      );
      throw new Error('Failed to fetch live cricket matches from CricketData');
    }
  }

  /**
   * Get upcoming cricket matches
   */
  async getUpcomingMatches(): Promise<any[]> {
    try {
      const cacheKey = 'cricketdata:upcoming_matches';
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: {
            apikey: this.apiKey,
            status: 'upcoming',
          },
        }),
      );

      const matches = response.data?.data || response.data || [];
      
      // Cache for 5 minutes (upcoming matches don't change as frequently)
      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 300 : 60;
      await this.redisService.set(cacheKey, JSON.stringify(matches), cacheDuration);

      return matches;
    } catch (error: any) {
      this.logger.error(
        'Error fetching upcoming cricket matches from CricketData',
        error.stack,
        'CricketDataService',
      );
      throw error;
    }
  }

  /**
   * Get completed cricket matches
   */
  async getCompletedMatches(): Promise<any[]> {
    try {
      const cacheKey = 'cricketdata:completed_matches';
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: {
            apikey: this.apiKey,
            status: 'completed',
          },
        }),
      );

      const matches = response.data?.data || response.data || [];
      
      // Cache for 1 hour (completed matches don't change)
      await this.redisService.set(cacheKey, JSON.stringify(matches), 3600);

      return matches;
    } catch (error: any) {
      this.logger.error(
        'Error fetching completed cricket matches from CricketData',
        error.stack,
        'CricketDataService',
      );
      throw new Error('Failed to fetch completed cricket matches from CricketData');
    }
  }

  /**
   * Get detailed match information including commentary
   */
  async getMatchDetails(matchId: string): Promise<any> {
    try {
      const cacheKey = `cricketdata:match:${matchId}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches/${matchId}`, {
          params: {
            apikey: this.apiKey,
            include: 'commentary,scorecard',
          },
        }),
      );

      const match = response.data?.data || response.data;
      
      // Cache for 30 seconds (live match details update frequently)
      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 30 : 15;
      await this.redisService.set(cacheKey, JSON.stringify(match), cacheDuration);

      return match;
    } catch (error: any) {
      this.logger.error(
        `Error fetching match details for ${matchId} from CricketData`,
        error.stack,
        'CricketDataService',
      );
      throw new Error('Failed to fetch match details from CricketData');
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(playerId?: string): Promise<any> {
    try {
      const cacheKey = playerId 
        ? `cricketdata:player:${playerId}`
        : 'cricketdata:players';
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const url = playerId 
        ? `${this.baseUrl}/players/${playerId}`
        : `${this.baseUrl}/players`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            apikey: this.apiKey,
          },
        }),
      );

      const data = response.data?.data || response.data;
      
      // Cache for 1 hour (player stats don't change frequently)
      await this.redisService.set(cacheKey, JSON.stringify(data), 3600);

      return data;
    } catch (error: any) {
      this.logger.error(
        `Error fetching player stats from CricketData`,
        error.stack,
        'CricketDataService',
      );
      throw new Error('Failed to fetch player statistics from CricketData');
    }
  }

  /**
   * Get series information
   */
  async getSeries(): Promise<any[]> {
    try {
      const cacheKey = 'cricketdata:series';
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      if (!this.apiKey) {
        throw new Error('CRICKETDATA_API_KEY is not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/series`, {
          params: {
            apikey: this.apiKey,
          },
        }),
      );

      const series = response.data?.data || response.data || [];
      
      // Cache for 1 hour (series info doesn't change frequently)
      await this.redisService.set(cacheKey, JSON.stringify(series), 3600);

      return series;
    } catch (error: any) {
      this.logger.error(
        'Error fetching series from CricketData',
        error.stack,
        'CricketDataService',
      );
      throw new Error('Failed to fetch series from CricketData');
    }
  }
}

