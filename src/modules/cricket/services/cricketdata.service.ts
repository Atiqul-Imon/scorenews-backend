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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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
      // No caching - always fetch fresh data
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
      
      // No caching - return fresh data
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

