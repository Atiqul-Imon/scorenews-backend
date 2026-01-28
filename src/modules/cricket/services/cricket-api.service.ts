import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../../redis/redis.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

@Injectable()
export class CricketApiService {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {
    this.baseUrl = this.configService.get<string>('CRICKET_API_BASE_URL', 'https://api.cricapi.com/v1');
    this.apiKey = this.configService.get<string>('CRICKET_API_KEY', '');
  }

  async getLiveMatches(): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: { apikey: this.apiKey, status: 'live' },
        }),
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'API returned non-success status');
      }

      const matches = response.data.data || [];
      // No caching - return fresh data
      return matches;
    } catch (error: any) {
      this.logger.error('Error fetching live cricket matches', error.stack, 'CricketApiService');
      throw new Error('Failed to fetch live cricket matches');
    }
  }

  async getUpcomingMatches(): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: { apikey: this.apiKey, status: 'upcoming' },
        }),
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'API returned non-success status');
      }

      const matches = response.data.data || [];
      // No caching - return fresh data
      return matches;
    } catch (error: any) {
      this.logger.error('Error fetching upcoming cricket matches', error.stack, 'CricketApiService');
      throw error;
    }
  }

  async getCompletedMatches(): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches`, {
          params: { apikey: this.apiKey, status: 'completed' },
        }),
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'API returned non-success status');
      }

      const matches = response.data.data || [];
      // No caching - return fresh data
      return matches;
    } catch (error: any) {
      this.logger.error('Error fetching completed cricket matches', error.stack, 'CricketApiService');
      throw new Error('Failed to fetch completed cricket matches');
    }
  }

  async getMatchDetails(matchId: string): Promise<any> {
    try {
      // No caching - always fetch fresh data
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/matches/${matchId}`, {
          params: { apikey: this.apiKey },
        }),
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'API returned non-success status');
      }

      const match = response.data.data;
      // No caching - return fresh data
      return match;
    } catch (error: any) {
      this.logger.error(`Error fetching match details for ${matchId}`, error.stack, 'CricketApiService');
      throw new Error('Failed to fetch match details');
    }
  }
}





