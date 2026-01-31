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
      
      // Use include parameters for v2.0 API
      // NOTE: The include parameter may not always return nested data in livescores endpoint
      // We'll handle missing nested data in the transformer
      const includeParam = sport === 'cricket' 
        ? 'scoreboards,localteam,visitorteam,venue' 
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

      // Log full response structure for debugging
      this.logger.log(`=== API RESPONSE DEBUG ===`, 'SportsMonksService');
      this.logger.log(`Response keys: ${JSON.stringify(Object.keys(response.data || {}))}`, 'SportsMonksService');
      this.logger.log(`Response.data type: ${typeof response.data}`, 'SportsMonksService');
      this.logger.log(`Response.data.data type: ${typeof response.data?.data}`, 'SportsMonksService');
      this.logger.log(`Response.data.data length: ${Array.isArray(response.data?.data) ? response.data.data.length : 'not an array'}`, 'SportsMonksService');
      
      // Try multiple possible response structures
      let matches: any[] = [];
      if (Array.isArray(response.data?.data)) {
        matches = response.data.data;
      } else if (Array.isArray(response.data)) {
        matches = response.data;
      } else if (response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data)) {
        // Sometimes API returns { data: { matches: [...] } }
        matches = response.data.data.matches || response.data.data.data || [];
      }
      
      this.logger.log(`Live scores endpoint returned ${matches.length} matches (after parsing)`, 'SportsMonksService');
      
      if (matches.length > 0) {
        // Log detailed structure of first match to verify API response format
        const firstMatch = matches[0];
        this.logger.log(`=== SPORTSMONKS V2 API RESPONSE STRUCTURE ===`, 'SportsMonksService');
        this.logger.log(`First match structure: ${JSON.stringify({
          id: firstMatch.id,
          name: firstMatch.name,
          state_id: firstMatch.state_id,
          status: firstMatch.status,
          starting_at: firstMatch.starting_at,
          localteam_id: firstMatch.localteam_id,
          visitorteam_id: firstMatch.visitorteam_id,
          has_localteam: !!firstMatch.localteam,
          has_visitorteam: !!firstMatch.visitorteam,
          localteam_name: firstMatch.localteam?.name,
          visitorteam_name: firstMatch.visitorteam?.name,
          scoreboards_count: firstMatch.scoreboards?.length || 0,
          has_venue: !!firstMatch.venue,
          venue_name: firstMatch.venue?.name,
          note: firstMatch.note,
          live: firstMatch.live,
        }, null, 2)}`, 'SportsMonksService');
        
        // Log scoreboards structure if available
        if (firstMatch.scoreboards && firstMatch.scoreboards.length > 0) {
          this.logger.log(`Scoreboards structure: ${JSON.stringify(firstMatch.scoreboards.slice(0, 2).map((s: any) => ({
            scoreboard: s.scoreboard,
            team_id: s.team_id,
            type: s.type,
            total: s.total,
            wickets: s.wickets,
            overs: s.overs,
          })), null, 2)}`, 'SportsMonksService');
        }
        
        const sample = matches.slice(0, 3).map((m: any) => ({
          id: m.id,
          state_id: m.state_id,
          name: m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`,
        }));
        this.logger.log(`Sample live matches: ${JSON.stringify(sample, null, 2)}`, 'SportsMonksService');
      }
      
      return matches;
    } catch (error: any) {
      // Log detailed error information
      this.logger.error(`=== LIVESCORES ENDPOINT ERROR ===`, 'SportsMonksService');
      this.logger.error(`Error message: ${error.message}`, '', 'SportsMonksService');
      this.logger.error(`Error status: ${error.response?.status || 'N/A'}`, '', 'SportsMonksService');
      this.logger.error(`Error response data: ${JSON.stringify(error.response?.data || {})}`, '', 'SportsMonksService');
      this.logger.error(`Error stack: ${error.stack}`, '', 'SportsMonksService');
      
      // If livescores endpoint fails, DO NOT use fixtures endpoint as fallback
      // User explicitly requested to use ONLY /livescores for live matches
      // Check for authentication errors (401) or authorization errors (403)
      const errorStatus = error.response?.status;
      const errorMessage = error.response?.data?.message || error.message || '';
      
      // User explicitly requested to use ONLY /livescores for live matches
      // Do NOT use fixtures fallback
      this.logger.error(`Live scores endpoint failed. NOT using fixtures fallback per user request.`, 'SportsMonksService');
      // Return empty array instead of throwing or using fallback
      return [];
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
      const includeParam = sport === 'cricket' ? 'scoreboards,localteam,visitorteam,venue' : 'scores,participants';
      
      // For v2.0 API, use the scores/results endpoint for completed matches
      // This is separate from the livescores endpoint
      let allMatches: any[] = [];
      
      // Calculate date range for last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const currentYear = now.getFullYear();
      
      try {
        // Try scores endpoint first (for completed matches with results)
        this.logger.log(`Calling SportMonks API: ${baseUrl}/scores`, 'SportsMonksService');
        try {
          const scoresResponse = await firstValueFrom(
            this.httpService.get(`${baseUrl}/scores`, {
              params: {
                api_token: this.apiToken,
                include: includeParam,
                per_page: 250,
              },
            }),
          );
          
          allMatches = scoresResponse.data?.data || [];
          this.logger.log(`Scores endpoint returned ${allMatches.length} matches`, 'SportsMonksService');
        } catch (scoresError: any) {
          // If scores endpoint doesn't exist or fails, fall back to fixtures endpoint
          this.logger.warn(`Scores endpoint failed (${scoresError.response?.status || 'unknown'}), using fixtures endpoint as fallback`, 'SportsMonksService');
          
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
      
      // v2.0 API: Commentary is available through 'balls' include
      // Balls contain ball-by-ball data which can be used as commentary
      this.logger.log(`Fetching ball-by-ball data (commentary) for match ${matchId}`, 'SportsMonksService');
      
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
            params: {
              api_token: this.apiToken,
              include: 'balls.batsman,balls.bowler,balls.score,balls.batsmanout,balls.catchstump',
            },
          }),
        );

        const balls = response.data?.data?.balls || [];
        
        if (balls.length > 0) {
          this.logger.log(`Found ${balls.length} ball-by-ball entries for commentary`, 'SportsMonksService');
          // Transform balls into commentary format
          return balls.map((ball: any, index: number) => ({
            id: ball.id || index,
            over: ball.over || 0,
            ball: ball.ball || 0,
            ballNumber: ball.ball || 0,
            runs: ball.score?.runs || 0,
            wickets: ball.score?.wickets || 0,
            isWicket: ball.batsmanout !== null || ball.catchstump !== null,
            batsman: ball.batsman?.name || ball.batsman?.fullname || '',
            bowler: ball.bowler?.name || ball.bowler?.fullname || '',
            commentary: this.generateCommentaryText(ball),
            timestamp: ball.updated_at || ball.created_at || new Date().toISOString(),
          }));
        } else {
          this.logger.warn(`No ball-by-ball data available for match ${matchId}`, 'SportsMonksService');
          return [];
        }
      } catch (error: any) {
        this.logger.error(`Error fetching ball-by-ball data for ${matchId}: ${error.message}`, '', 'SportsMonksService');
        if (error.response?.status === 400) {
          this.logger.warn(`Balls include may not be available for this match or subscription`, 'SportsMonksService');
        }
        return [];
      }
    } catch (error: any) {
      this.logger.error(`Error fetching ${sport} commentary for ${matchId}`, error.stack, 'SportsMonksService');
      return [];
    }
  }

  private generateCommentaryText(ball: any): string {
    const runs = ball.score?.runs || 0;
    const isWicket = ball.batsmanout !== null || ball.catchstump !== null;
    const batsman = ball.batsman?.name || ball.batsman?.fullname || 'Batsman';
    const bowler = ball.bowler?.name || ball.bowler?.fullname || 'Bowler';
    
    if (isWicket) {
      return `Wicket! ${batsman} out. ${bowler} takes the wicket.`;
    } else if (runs === 6) {
      return `Six! ${batsman} hits it out of the park.`;
    } else if (runs === 4) {
      return `Four! ${batsman} finds the boundary.`;
    } else if (runs > 0) {
      return `${runs} run${runs > 1 ? 's' : ''} scored by ${batsman}.`;
    } else {
      return `Dot ball. ${bowler} to ${batsman}.`;
    }
  }
}

