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
    // Use v2.0 API for cricket (v3 requires different subscription)
    if (sport === 'cricket') {
      return 'https://cricket.sportmonks.com/api/v2.0';
    }
    return `https://api.sportmonks.com/v3/${sport}`;
  }

  async getLiveMatches(sport: Sport = 'cricket'): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
      const baseUrl = this.getBaseUrl(sport);
      // Use v2.0 endpoint for cricket
      const endpoint = sport === 'cricket' ? `${baseUrl}/livescores` : `${baseUrl}/livescores/inplay`;
      
      this.logger.log(`Fetching live matches from ${endpoint}`, 'SportsMonksService');
      
      // Use minimal include parameters for v2.0 API
      // Start with basic includes to avoid authentication issues
      const includeParam = sport === 'cricket' 
        ? 'scoreboards,localteam,visitorteam' 
        : 'scores,participants';
      
      if (!this.apiToken) {
        this.logger.error('SPORTMONKS_API_TOKEN is missing!', '', 'SportsMonksService');
        throw new Error('SportsMonks API token is not configured');
      }
      
      this.logger.log(`Calling v2.0 API: ${endpoint}`, 'SportsMonksService');
      
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          params: {
            api_token: this.apiToken,
            include: includeParam,
          },
        }),
      );
      
      // Check for error response
      if (response.data?.status === 'error') {
        const errorMsg = response.data?.message?.message || response.data?.message || 'Unknown error';
        this.logger.error(`SportsMonks API error: ${errorMsg}`, '', 'SportsMonksService');
        throw new Error(`SportsMonks API error: ${errorMsg}`);
      }

      const matches = response.data?.data || [];
      this.logger.log(`Live scores endpoint returned ${matches.length} matches`, 'SportsMonksService');
      
      if (matches.length > 0) {
        const sample = matches.slice(0, 3).map((m: any) => ({
          id: m.id,
          state_id: m.state_id,
          name: m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`,
        }));
        this.logger.log(`Sample live matches: ${JSON.stringify(sample, null, 2)}`, 'SportsMonksService');
      }
      
      return matches;
    } catch (error: any) {
      // If livescores endpoint fails, use fixtures endpoint as fallback
      // This is more reliable for detecting live matches
      // Check for authentication errors (401) or authorization errors (403)
      const errorStatus = error.response?.status;
      const errorMessage = error.response?.data?.message || error.message || '';
      
      if (errorStatus === 404 || errorStatus === 403 || errorStatus === 401 || 
          (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('unauthenticated'))) {
        this.logger.warn(`Live scores endpoint failed (${errorStatus || 'unknown'}: ${errorMessage}), using fixtures endpoint as fallback`, 'SportsMonksService');
        this.logger.warn(`Live scores endpoint failed (${error.response?.status}), using fixtures endpoint as fallback`, 'SportsMonksService');
        
        try {
          const baseUrl = this.getBaseUrl(sport);
          // Use minimal includes for fixtures endpoint too
          const includeParam = sport === 'cricket' 
            ? 'scoreboards,localteam,visitorteam' 
            : 'scores,participants';
          
          this.logger.log(`Fetching from fixtures endpoint as fallback (v2.0)`, 'SportsMonksService');
          
          const response = await firstValueFrom(
            this.httpService.get(`${baseUrl}/fixtures`, {
              params: {
                api_token: this.apiToken,
                include: includeParam,
                per_page: 250, // Get more matches to find live ones
              },
            }),
          );

          const allFixtures = response.data?.data || [];
          this.logger.log(`Fixtures endpoint returned ${allFixtures.length} total matches`, 'SportsMonksService');
          
          const now = new Date();
          // Filter for live matches:
          // state_id 3 = in progress (live)
          // state_id 4 = break/paused (still live)
          // Or matches that have started but not ended
          const liveMatches = allFixtures.filter((match: any) => {
            // Check by state_id first
            if (match.state_id === 3 || match.state_id === 4) {
              return true;
            }
            
            // Check by time if state_id is not available
            if (match.starting_at) {
              const startTime = new Date(match.starting_at);
              // Match has started
              if (startTime <= now) {
                // Match hasn't ended (state_id not 5 or 6)
                if (match.state_id !== 5 && match.state_id !== 6) {
                  // Estimate end time (3-8 hours depending on format)
                  const estimatedDuration = 6 * 60 * 60 * 1000; // 6 hours default
                  const endTime = match.ending_at ? new Date(match.ending_at) : new Date(startTime.getTime() + estimatedDuration);
                  // Match is still within estimated duration
                  if (now <= endTime) {
                    return true;
                  }
                }
              }
            }
            return false;
          });

          this.logger.log(`Found ${liveMatches.length} live matches from fixtures fallback`, 'SportsMonksService');
          
          if (liveMatches.length > 0) {
            const sample = liveMatches.slice(0, 3).map((m: any) => ({
              id: m.id,
              state_id: m.state_id,
              date: m.starting_at,
              name: m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`,
            }));
            this.logger.log(`Sample live matches from fixtures: ${JSON.stringify(sample, null, 2)}`, 'SportsMonksService');
          }

          // No caching - return fresh data
          return liveMatches;
        } catch (fallbackError: any) {
          this.logger.error(`Fixtures fallback also failed: ${fallbackError.message}`, fallbackError.stack, 'SportsMonksService');
          if (fallbackError.response) {
            this.logger.error(`Fallback error status: ${fallbackError.response.status}`, '', 'SportsMonksService');
            this.logger.error(`Fallback error response: ${JSON.stringify(fallbackError.response.data)}`, '', 'SportsMonksService');
          }
          return [];
        }
      }
      this.logger.error(`Error fetching live ${sport} matches`, error.stack, 'SportsMonksService');
      if (error.response) {
        this.logger.error(`Error status: ${error.response.status}`, '', 'SportsMonksService');
        this.logger.error(`Error response: ${JSON.stringify(error.response.data)}`, '', 'SportsMonksService');
      }
      throw error;
    }
  }

  async getUpcomingMatches(sport: Sport = 'cricket'): Promise<any[]> {
    // Fixtures not covered by subscription - return empty array
    // Use team rankings instead
    this.logger.warn('Fixtures endpoint not available in subscription, returning empty array', 'SportsMonksService');
    return [];
  }

  async getCompletedMatches(sport: Sport = 'cricket'): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
      const baseUrl = this.getBaseUrl(sport);
      const includeParam = sport === 'cricket' ? 'scoreboards,localteam,visitorteam' : 'scores,participants';
      
      // Calculate date range for last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const currentYear = now.getFullYear();
      
      // For v2.0 API, use regular fixtures endpoint and filter client-side
      // The date endpoint may not be available or may not work as expected
      let allMatches: any[] = [];
      
      try {
        this.logger.log(`Calling SportMonks API: ${baseUrl}/fixtures`, 'SportsMonksService');
        const response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures`, {
            params: {
              api_token: this.apiToken,
              include: includeParam,
              per_page: 250,
            },
          }),
        );
        
        // Log full response structure for debugging
        this.logger.log(`API Response keys: ${JSON.stringify(Object.keys(response.data || {}))}`, 'SportsMonksService');
        
        allMatches = response.data?.data || [];
        this.logger.log(`Regular fixtures endpoint returned ${allMatches.length} total matches`, 'SportsMonksService');
        
        // Log response structure
        if (allMatches.length === 0) {
          this.logger.warn(`No matches returned. Full response: ${JSON.stringify(response.data, null, 2)}`, 'SportsMonksService');
        } else {
          // Log sample matches to see what we're getting
          const sample = allMatches.slice(0, 5).map((m: any) => ({
            id: m.id,
            date: m.starting_at,
            state_id: m.state_id,
            name: m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`,
            league: m.league?.name || m.season?.name || 'Unknown',
          }));
          this.logger.log(`Sample matches from API: ${JSON.stringify(sample, null, 2)}`, 'SportsMonksService');
          
          // Log state_id distribution
          const stateIds = allMatches.map((m: any) => m.state_id).filter((id: any) => id !== undefined);
          const stateIdCounts = stateIds.reduce((acc: any, id: any) => {
            acc[id] = (acc[id] || 0) + 1;
            return acc;
          }, {});
          this.logger.log(`State ID distribution: ${JSON.stringify(stateIdCounts)}`, 'SportsMonksService');
        }
      } catch (error: any) {
        this.logger.error(
          'Failed to fetch from fixtures endpoint',
          error.stack || error.message,
          'SportsMonksService',
        );
        if (error.response) {
          this.logger.error(`Error status: ${error.response.status}`, '', 'SportsMonksService');
          this.logger.error(`Error response: ${JSON.stringify(error.response.data)}`, '', 'SportsMonksService');
        } else if (error.message) {
          this.logger.error(`Error message: ${error.message}`, '', 'SportsMonksService');
        }
        return [];
      }
      
      // Remove duplicates based on match ID
      const uniqueMatches = Array.from(
        new Map(allMatches.map((match) => [match.id, match])).values(),
      );
      
      this.logger.log(`Total unique matches fetched: ${uniqueMatches.length}`, 'SportsMonksService');

      // Log sample matches to see what we're getting
      if (uniqueMatches.length > 0) {
        const sampleMatches = uniqueMatches.slice(0, 5).map((m: any) => ({
          id: m.id,
          name: m.name || `${m.localteam?.name || 'Team1'} vs ${m.visitorteam?.name || 'Team2'}`,
          league: m.league?.name || m.season?.name || 'Unknown',
          date: m.starting_at,
          state_id: m.state_id,
        }));
        this.logger.log(`Sample matches from API: ${JSON.stringify(sampleMatches, null, 2)}`, 'SportsMonksService');
      }

      // Filter for completed matches (state_id 5 = finished, 6 = abandoned)
      // Filter to last 7 days only
      const completedMatches = uniqueMatches
        .filter((match: any) => {
          // Check if match is completed by state_id
          const isCompleted = match.state_id === 5 || match.state_id === 6;
          
          if (!isCompleted) return false;
          if (!match.starting_at) return false;
          
          const matchDate = new Date(match.starting_at);
          
          // Validate date is not in the future
          if (matchDate > now) {
            return false;
          }
          
          // Only include matches from last 7 days
          if (matchDate < sevenDaysAgo) {
            return false;
          }
          
          // Additional validation: match must be from current year or last year
          const matchYear = matchDate.getFullYear();
          if (matchYear < currentYear - 1) {
            return false;
          }
          
          return true;
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(a.starting_at || 0).getTime();
          const dateB = new Date(b.starting_at || 0).getTime();
          return dateB - dateA; // Most recent first
        });

      // Log filtered matches with detailed information
      this.logger.log(`Found ${completedMatches.length} completed matches in last 7 days`, 'SportsMonksService');
      if (completedMatches.length > 0) {
        this.logger.log(`Most recent match: ${completedMatches[0].starting_at}`, 'SportsMonksService');
        const matchDetails = completedMatches.slice(0, 5).map((m: any) => ({
          id: m.id,
          name: m.name || `${m.localteam?.name} vs ${m.visitorteam?.name}`,
          date: m.starting_at,
          state_id: m.state_id,
          league: m.league?.name || m.season?.name,
        }));
        this.logger.log(`Completed matches details: ${JSON.stringify(matchDetails, null, 2)}`, 'SportsMonksService');
      } else {
        // Log all state_ids to debug
        const stateIds = uniqueMatches.map((m: any) => m.state_id).filter((id: any) => id !== undefined);
        this.logger.warn(`No completed matches found. Total matches fetched: ${uniqueMatches.length}`, 'SportsMonksService');
        this.logger.warn(`Available state_ids: ${[...new Set(stateIds)].join(', ')}`, 'SportsMonksService');
        
        if (uniqueMatches.length > 0) {
          const sampleDates = uniqueMatches
            .slice(0, 10)
            .map((m: any) => ({
              date: m.starting_at,
              state_id: m.state_id,
              name: m.name || `${m.localteam?.name} vs ${m.visitorteam?.name}`,
            }));
          this.logger.warn(`Sample matches (all states): ${JSON.stringify(sampleDates, null, 2)}`, 'SportsMonksService');
        } else {
          this.logger.error('No matches fetched from API at all. Check API token and endpoint.', '', 'SportsMonksService');
        }
      }

      // No caching - return fresh data
      return completedMatches;
    } catch (error: any) {
      this.logger.error(`Error fetching completed ${sport} matches`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getMatchDetails(matchId: string, sport: Sport = 'cricket'): Promise<any> {
    try {
      // No caching - always fetch fresh data
      const baseUrl = this.getBaseUrl(sport);
      // v2.0 uses different includes than v3
      // Include batting and bowling for detailed match statistics
      // For SportMonks v2.0 cricket API, use simpler include format
      // v2.0 supports: scoreboards (which includes batting/bowling), batting, bowling separately
      // Player data is included automatically when requesting batting/bowling
      const includeParam = sport === 'cricket' 
        ? 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season' 
        : 'scores,participants,lineups,events';
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
          params: {
            api_token: this.apiToken,
            include: includeParam,
          },
        }),
      );

      const match = response.data?.data;
      
      // Check if match data exists
      if (!match) {
        this.logger.warn(`No match data returned from SportMonks API for ${matchId}`, 'SportsMonksService');
        throw new Error(`Match ${matchId} not found in SportMonks API`);
      }
      
      // Log the structure to debug batting/bowling data
      if (sport === 'cricket') {
        this.logger.log(`[Match ${matchId}] Raw API response keys: ${Object.keys(match).join(', ')}`, 'SportsMonksService');
        this.logger.log(`[Match ${matchId}] Has batting: ${!!match.batting}, Type: ${Array.isArray(match.batting) ? 'array' : typeof match.batting}, Length: ${Array.isArray(match.batting) ? match.batting.length : 'N/A'}`, 'SportsMonksService');
        this.logger.log(`[Match ${matchId}] Has bowling: ${!!match.bowling}, Type: ${Array.isArray(match.bowling) ? 'array' : typeof match.bowling}, Length: ${Array.isArray(match.bowling) ? match.bowling.length : 'N/A'}`, 'SportsMonksService');
        this.logger.log(`[Match ${matchId}] Has scoreboards: ${!!match.scoreboards}, Count: ${match.scoreboards?.length || 0}`, 'SportsMonksService');
        if (match.scoreboards && match.scoreboards.length > 0) {
          match.scoreboards.forEach((sb: any, idx: number) => {
            this.logger.log(`[Match ${matchId}] Scoreboard ${idx} keys: ${Object.keys(sb || {}).join(', ')}`, 'SportsMonksService');
            if (sb.batting) {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} has batting: ${Array.isArray(sb.batting) ? sb.batting.length : 'not array'} records`, 'SportsMonksService');
              if (Array.isArray(sb.batting) && sb.batting.length > 0) {
                this.logger.log(`[Match ${matchId}] Sample batting record keys: ${Object.keys(sb.batting[0] || {}).join(', ')}`, 'SportsMonksService');
              }
            }
            if (sb.bowling) {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length : 'not array'} records`, 'SportsMonksService');
              if (Array.isArray(sb.bowling) && sb.bowling.length > 0) {
                this.logger.log(`[Match ${matchId}] Sample bowling record keys: ${Object.keys(sb.bowling[0] || {}).join(', ')}`, 'SportsMonksService');
              }
            }
          });
        }
        // Log sample batting/bowling data if available at root
        if (Array.isArray(match.batting) && match.batting.length > 0) {
          this.logger.log(`[Match ${matchId}] Root batting sample: ${JSON.stringify(match.batting[0])}`, 'SportsMonksService');
        }
        if (Array.isArray(match.bowling) && match.bowling.length > 0) {
          this.logger.log(`[Match ${matchId}] Root bowling sample: ${JSON.stringify(match.bowling[0])}`, 'SportsMonksService');
        }
      }
      
      // No caching - return fresh data
      return match;
    } catch (error: any) {
      // If it's a 404 or not found error, throw a more specific error
      if (error.response?.status === 404 || error.message?.includes('not found')) {
        this.logger.warn(`Match ${matchId} not found in SportMonks API`, 'SportsMonksService');
        throw new Error(`Match ${matchId} not found`);
      }
      this.logger.error(`Error fetching ${sport} match details for ${matchId}`, error.stack, 'SportsMonksService');
      throw error;
    }
  }

  async getPlayerDetails(playerId: string): Promise<any> {
    try {
      // No caching - always fetch fresh data
      // v2.0 API for cricket players
      const baseUrl = 'https://cricket.sportmonks.com/api/v2.0';
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/players/${playerId}`, {
          params: {
            api_token: this.apiToken,
          },
        }),
      );

      const player = response.data?.data;
      // Cache player data for 24 hours (player names don't change)
      // No caching - return fresh data
      return player;
    } catch (error: any) {
      this.logger.warn(`Error fetching player details for ${playerId}`, error.stack, 'SportsMonksService');
      return null;
    }
  }

  async getCommentary(matchId: string, sport: Sport = 'cricket'): Promise<any[]> {
    try {
      // No caching - always fetch fresh data
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
      // No caching - return fresh data
      return commentary;
    } catch (error: any) {
      this.logger.error(`Error fetching ${sport} commentary for ${matchId}`, error.stack, 'SportsMonksService');
      throw error;
    }
  }
}

