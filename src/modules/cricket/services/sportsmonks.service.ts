import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../../redis/redis.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

type Sport = 'cricket' | 'football';

@Injectable()
export class SportsMonksService {
  private apiToken: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {
    this.apiToken = this.configService.get<string>('SPORTMONKS_API_TOKEN', '');
  }

  private getBaseUrl(sport: Sport): string {
    return `https://api.sportmonks.com/v3/${sport}`;
  }

  async getLiveMatches(sport: Sport = 'cricket'): Promise<any[]> {
    try {
      const cacheKey = `sportsmonks:live_matches:${sport}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const baseUrl = this.getBaseUrl(sport);
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/livescores/inplay`, {
          params: {
            api_token: this.apiToken,
            include: 'scores,participants',
          },
        }),
      );

      const matches = response.data?.data || [];
      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
      await this.redisService.set(cacheKey, JSON.stringify(matches), cacheDuration);

      return matches;
    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.status === 403) {
        // Try fixtures endpoint as fallback
        try {
          const baseUrl = this.getBaseUrl(sport);
          const response = await firstValueFrom(
            this.httpService.get(`${baseUrl}/fixtures`, {
              params: {
                api_token: this.apiToken,
                include: 'scores,participants',
                per_page: 50,
              },
            }),
          );

          const allFixtures = response.data?.data || [];
          const now = new Date();
          const liveMatches = allFixtures.filter((match: any) => {
            if (match.state_id === 3) return true;
            if (match.starting_at) {
              const startTime = new Date(match.starting_at);
              const endTime = match.ending_at ? new Date(match.ending_at) : new Date(startTime.getTime() + 3 * 60 * 60 * 1000);
              return now >= startTime && now <= endTime && match.state_id !== 5;
            }
            return false;
          });

          const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 900 : 30;
          await this.redisService.set(`sportsmonks:live_matches:${sport}`, JSON.stringify(liveMatches), cacheDuration);
          return liveMatches;
        } catch (fallbackError) {
          this.logger.error(`Error fetching live ${sport} matches`, fallbackError, 'SportsMonksService');
          return [];
        }
      }
      this.logger.error(`Error fetching live ${sport} matches`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getUpcomingMatches(sport: Sport = 'cricket'): Promise<any[]> {
    try {
      const cacheKey = `sportsmonks:upcoming_matches:${sport}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const baseUrl = this.getBaseUrl(sport);
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/fixtures`, {
          params: {
            api_token: this.apiToken,
            include: 'participants',
            per_page: 100,
          },
        }),
      );

      const allMatches = response.data?.data || [];
      const now = new Date();
      const upcomingMatches = allMatches.filter((match: any) => {
        if (!match.starting_at) return false;
        const matchDate = new Date(match.starting_at);
        return matchDate > now && (match.state_id === 1 || match.state_id === 2);
      });

      const cacheDuration = this.configService.get<string>('NODE_ENV') === 'production' ? 300 : 30;
      await this.redisService.set(cacheKey, JSON.stringify(upcomingMatches), cacheDuration);

      return upcomingMatches;
    } catch (error: any) {
      this.logger.error(`Error fetching upcoming ${sport} matches`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getCompletedMatches(sport: Sport = 'cricket'): Promise<any[]> {
    try {
      const cacheKey = `sportsmonks:completed_matches:${sport}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const baseUrl = this.getBaseUrl(sport);
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/fixtures`, {
          params: {
            api_token: this.apiToken,
            include: 'scores,participants',
            per_page: 100,
          },
        }),
      );

      const allMatches = response.data?.data || [];
      const now = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const completedMatches = allMatches
        .filter((match: any) => {
          if (match.state_id !== 5) return false;
          if (!match.starting_at) return false;
          const matchDate = new Date(match.starting_at);
          return matchDate >= twoYearsAgo && matchDate <= now;
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(a.starting_at || 0).getTime();
          const dateB = new Date(b.starting_at || 0).getTime();
          return dateB - dateA;
        });

      await this.redisService.set(cacheKey, JSON.stringify(completedMatches), 3600);
      return completedMatches;
    } catch (error: any) {
      this.logger.error(`Error fetching completed ${sport} matches`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getMatchDetails(matchId: string, sport: Sport = 'cricket'): Promise<any> {
    try {
      const cacheKey = `sportsmonks:match:${sport}:${matchId}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const baseUrl = this.getBaseUrl(sport);
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
          params: {
            api_token: this.apiToken,
            include: 'scores,participants,lineups,events',
          },
        }),
      );

      const match = response.data?.data;
      await this.redisService.set(cacheKey, JSON.stringify(match), 60);

      return match;
    } catch (error: any) {
      this.logger.error(`Error fetching ${sport} match details for ${matchId}`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getCommentary(matchId: string, sport: Sport = 'cricket'): Promise<any[]> {
    try {
      const cacheKey = `sportsmonks:commentary:${sport}:${matchId}`;
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const baseUrl = this.getBaseUrl(sport);
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/commentaries/fixtures/${matchId}`, {
          params: {
            api_token: this.apiToken,
            include: 'comments',
          },
        }),
      );

      const commentary = response.data?.data || [];
      await this.redisService.set(cacheKey, JSON.stringify(commentary), 30);

      return commentary;
    } catch (error: any) {
      this.logger.error(`Error fetching ${sport} commentary for ${matchId}`, error.stack, 'SportsMonksService');
      throw error;
    }
  }
}

