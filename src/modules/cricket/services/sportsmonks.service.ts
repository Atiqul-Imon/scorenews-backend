import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../../redis/redis.service';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

type Sport = 'cricket' | 'football';

@Injectable()
export class SportsMonksService {
  private cricketApiToken: string;
  private footballApiToken: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {
    this.cricketApiToken = this.configService.get<string>('SPORTSMONKS_API_TOKEN', '');
    this.footballApiToken = this.configService.get<string>('SPORTSMONK_FOOTBALL_API_TOKEN', '');
  }

  private getApiToken(sport: Sport): string {
    if (sport === 'football') {
      return this.footballApiToken || this.cricketApiToken; // Fallback to cricket token if football token not set
    }
    return this.cricketApiToken;
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
      // Use v2.0 endpoint for cricket, v3 endpoint for football
      // IMPORTANT: For Football V3, use /livescores NOT /livescores/inplay
      // /livescores works with European Plan, /inplay may require different subscription
      const endpoint = sport === 'cricket' ? `${baseUrl}/livescores` : `${baseUrl}/livescores`;
      
      this.logger.log(`Fetching live matches from ${endpoint}`, 'SportsMonksService');
      
      // Use include parameters for v2.0 API (cricket) and v3 API (football)
      // NOTE: v2.0 uses commas, v3 uses semicolons for includes
      // For cricket v2.0: /livescores endpoint has very limited allowed includes
      // For football v3: Testing WITHOUT includes first - may require higher subscription tier
      const includeParam = sport === 'cricket' 
        ? 'scoreboards,localteam,visitorteam,venue' 
        : 'state';  // Minimal include for football - just state to check if match is live
      
      const apiToken = this.getApiToken(sport);
      if (!apiToken) {
        const tokenName = sport === 'football' ? 'SPORTSMONK_FOOTBALL_API_TOKEN' : 'SPORTSMONKS_API_TOKEN';
        this.logger.error(`${tokenName} is missing!`, '', 'SportsMonksService');
        throw new Error(`SportsMonks ${sport} API token is not configured`);
      }
      
      this.logger.log(`Calling ${sport === 'cricket' ? 'v2.0' : 'v3'} API: ${endpoint}`, 'SportsMonksService');
      
      // Check Redis cache first to reduce API calls and costs
      const cacheKey = `sportsmonks:live_matches:${sport}`;
      const cachedData = await this.redisService.get(cacheKey);
      
      if (cachedData) {
        this.logger.log(`Returning cached live matches for ${sport} (cache hit)`, 'SportsMonksService');
        return JSON.parse(cachedData);
      }
      
      // No cache - fetch from API
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          params: {
            api_token: apiToken,
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
      
      // Log if we got a subscription/rate limit message instead of data
      if (!response.data.data && response.data.message) {
        this.logger.error(`SportsMonks API returned subscription/rate limit message instead of data`, '', 'SportsMonksService');
        this.logger.error(`Full response: ${JSON.stringify(response.data)}`, '', 'SportsMonks');
        // Return empty array - endpoint not available in subscription
        return [];
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
        // Log COMPLETE structure of first match to see ALL available fields
        const firstMatch = matches[0];
        const apiVersion = sport === 'cricket' ? 'V2' : 'V3';
        this.logger.log(`=== COMPLETE SPORTSMONKS ${apiVersion} API RESPONSE STRUCTURE ===`, 'SportsMonksService');
        this.logger.log(`All top-level keys in match object: ${JSON.stringify(Object.keys(firstMatch))}`, 'SportsMonksService');
        this.logger.log(`Complete first match structure: ${JSON.stringify(firstMatch, null, 2)}`, 'SportsMonksService');
        
        // Log nested structures in detail
        if (firstMatch.localteam) {
          this.logger.log(`Local team structure: ${JSON.stringify(firstMatch.localteam, null, 2)}`, 'SportsMonksService');
        }
        if (firstMatch.visitorteam) {
          this.logger.log(`Visitor team structure: ${JSON.stringify(firstMatch.visitorteam, null, 2)}`, 'SportsMonksService');
        }
        if (firstMatch.venue) {
          this.logger.log(`Venue structure: ${JSON.stringify(firstMatch.venue, null, 2)}`, 'SportsMonksService');
        }
        if (firstMatch.scoreboards && firstMatch.scoreboards.length > 0) {
          this.logger.log(`Complete scoreboards structure: ${JSON.stringify(firstMatch.scoreboards, null, 2)}`, 'SportsMonksService');
        }
        if (firstMatch.league) {
          this.logger.log(`League structure: ${JSON.stringify(firstMatch.league, null, 2)}`, 'SportsMonksService');
        }
        if (firstMatch.season) {
          this.logger.log(`Season structure: ${JSON.stringify(firstMatch.season, null, 2)}`, 'SportsMonksService');
        }
        
        const sample = matches.slice(0, 3).map((m: any) => ({
          id: m.id,
          state_id: m.state_id,
          name: m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`,
        }));
        this.logger.log(`Sample live matches: ${JSON.stringify(sample, null, 2)}`, 'SportsMonksService');
      }
      
      // Cache the results for 30 seconds to reduce API calls
      // This prevents rate limiting while still getting relatively fresh data
      if (matches.length > 0) {
        await this.redisService.set(cacheKey, JSON.stringify(matches), 30);
        this.logger.log(`Cached ${matches.length} live matches for ${sport} (30s TTL)`, 'SportsMonksService');
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
      // Include player data for batting/bowling to get real player names
      // v2.0 uses commas, v3 uses semicolons
      const includeParam = sport === 'cricket' 
        ? 'scoreboards,localteam,visitorteam,venue,batting.player,bowling.player' 
        : 'participants;state;league;scores';
      
      // For v2.0 API, use the fixtures endpoint for completed matches
      // NOTE: The /scores endpoint does not exist in SportsMonks v2.0 API
      // We use /fixtures endpoint and filter for completed matches (state_id = 5 or 6)
      let allMatches: any[] = [];
      
      // Calculate date range for last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const currentYear = now.getFullYear();
      
      try {
        // Use fixtures endpoint (scores endpoint doesn't exist in v2.0)
        const apiToken = this.getApiToken(sport);
        this.logger.log(`Calling SportMonks API: ${baseUrl}/fixtures`, 'SportsMonksService');
        const response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures`, {
            params: {
              api_token: apiToken,
              include: includeParam,
              per_page: 250,
            },
          }),
        );
      
        // Log full response structure for debugging
        this.logger.log(`API Response keys: ${JSON.stringify(Object.keys(response.data || {}))}`, 'SportsMonksService');
        
        allMatches = response.data?.data || [];
        this.logger.log(`Fixtures endpoint returned ${allMatches.length} total matches`, 'SportsMonksService');
        
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
      // CRITICAL FIX: Only use /fixtures/{id} endpoint to avoid double API calls
      // Previously was calling /livescores first, then /fixtures/{id} (2 calls per request!)
      // This was causing excessive API usage and rate limiting
      const baseUrl = this.getBaseUrl(sport);
      const apiToken = this.getApiToken(sport);
      
      // Check Redis cache first to reduce API calls
      const cacheKey = `sportsmonks:match_details:${sport}:${matchId}`;
      const cachedData = await this.redisService.get(cacheKey);
      
      if (cachedData) {
        this.logger.log(`[Match ${matchId}] Returning cached match details (cache hit)`, 'SportsMonksService');
        return JSON.parse(cachedData);
      }
      
      // Strategy: Use /fixtures/{id} endpoint directly (single API call)
      // This endpoint has all the data we need including scoreboards with batting/bowling
      // v2.0 uses different includes than v3
      let includeParam = sport === 'cricket' 
        ? 'localteam,visitorteam,scoreboards,venue,league,season' 
        : 'participants;state;league;scores;lineups;events';
      
      let match: any = null;
      let response: any = null;
      
      try {
        // CRITICAL: Removed cache buster to allow Redis caching
        // Redis cache (30s TTL) will reduce API calls significantly
        response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
            params: {
              api_token: apiToken,
              include: includeParam,
            },
          }),
        );
        match = response.data?.data;
        
        this.logger.log(`[Match ${matchId}] Successfully fetched from /fixtures/{id}`, 'SportsMonksService');
      } catch (firstError: any) {
        // If 400 error, try with minimal includes (scoreboards should contain batting/bowling nested)
        // Avoid multiple retries to prevent rate limiting
        if (firstError.response?.status === 400) {
          this.logger.warn(`[Match ${matchId}] 400 error with includes: ${includeParam}, trying minimal scoreboards include...`, 'SportsMonksService');
          
          // Try 2: Minimal includes - scoreboards should contain batting/bowling nested inside
          const minimalInclude = sport === 'cricket' 
            ? 'localteam,visitorteam,scoreboards,venue' 
            : 'participants;state;league';
          
          try {
            response = await firstValueFrom(
              this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
                params: {
                  api_token: apiToken,
                  include: minimalInclude,
                },
              }),
            );
            match = response.data?.data;
            this.logger.log(`[Match ${matchId}] Successfully fetched with minimal includes (scoreboards should contain batting/bowling)`, 'SportsMonksService');
          } catch (secondError: any) {
            // If minimal includes also fail, log and throw
            this.logger.error(`[Match ${matchId}] Failed with minimal includes: ${secondError.response?.status} - ${JSON.stringify(secondError.response?.data || {})}`, '', 'SportsMonksService');
            throw secondError;
          }
        } else {
          throw firstError;
        }
      }
      
      // Cache the result for 30 seconds to reduce API calls
      if (match) {
        await this.redisService.set(cacheKey, JSON.stringify(match), 30);
        this.logger.log(`[Match ${matchId}] Cached match details (30s TTL)`, 'SportsMonksService');
      }
      
      // Check if match data exists
      if (!match) {
        this.logger.warn(`No match data returned from SportMonks API for ${matchId}`, 'SportsMonksService');
        throw new Error(`Match ${matchId} not found in SportMonks API`);
      }
      
      // Log COMPLETE structure to see ALL available fields from API
      if (sport === 'cricket') {
        this.logger.log(`[Match ${matchId}] === COMPLETE API RESPONSE STRUCTURE ===`, 'SportsMonksService');
        this.logger.log(`[Match ${matchId}] All top-level keys: ${Object.keys(match).join(', ')}`, 'SportsMonksService');
        
        // Log if batting/bowling exist and their structure
        this.logger.log(`[Match ${matchId}] Has batting: ${!!match.batting}, Type: ${Array.isArray(match.batting) ? 'array' : typeof match.batting}, Length: ${Array.isArray(match.batting) ? match.batting.length : 'N/A'}`, 'SportsMonksService');
        this.logger.log(`[Match ${matchId}] Has bowling: ${!!match.bowling}, Type: ${Array.isArray(match.bowling) ? 'array' : typeof match.bowling}, Length: ${Array.isArray(match.bowling) ? match.bowling.length : 'N/A'}`, 'SportsMonksService');
        
        // Log scoreboards structure - check if they contain batting/bowling and partnership
        if (match.scoreboards && match.scoreboards.length > 0) {
          this.logger.log(`[Match ${matchId}] Scoreboards count: ${match.scoreboards.length}`, 'SportsMonksService');
          match.scoreboards.forEach((sb: any, idx: number) => {
            const sbKeys = Object.keys(sb);
            this.logger.log(`[Match ${matchId}] Scoreboard ${idx} keys: ${sbKeys.join(', ')}`, 'SportsMonksService');
            if (sb.batting) {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} has batting: ${Array.isArray(sb.batting) ? sb.batting.length : 'not array'} records`, 'SportsMonksService');
            }
            if (sb.bowling) {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length : 'not array'} records`, 'SportsMonksService');
            }
            // Check for partnership in scoreboard
            const partnershipKeys = sbKeys.filter(k => k.toLowerCase().includes('partnership') || k.toLowerCase().includes('part'));
            if (partnershipKeys.length > 0) {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} has partnership-related keys: ${partnershipKeys.join(', ')}`, 'SportsMonksService');
              partnershipKeys.forEach(key => {
                this.logger.log(`[Match ${matchId}] Scoreboard ${idx} ${key}: ${JSON.stringify(sb[key])}`, 'SportsMonksService');
              });
            }
            // Log full scoreboard for current innings (type === 'total')
            if (sb.type === 'total') {
              this.logger.log(`[Match ${matchId}] Scoreboard ${idx} (current innings) full data: ${JSON.stringify(sb, null, 2)}`, 'SportsMonksService');
            }
          });
        }
        
        // Log sample batting/bowling data if available at root
        if (Array.isArray(match.batting) && match.batting.length > 0) {
          const sampleBatting = match.batting[0];
          this.logger.log(`[Match ${matchId}] Root batting sample keys: ${Object.keys(sampleBatting).join(', ')}`, 'SportsMonksService');
          this.logger.log(`[Match ${matchId}] Root batting sample: ${JSON.stringify(sampleBatting, null, 2)}`, 'SportsMonksService');
          // Check if player/batsman data is nested
          if (sampleBatting.batsman) {
            this.logger.log(`[Match ${matchId}] Batting record has batsman field: ${JSON.stringify(sampleBatting.batsman, null, 2)}`, 'SportsMonksService');
          }
          if (sampleBatting.player) {
            this.logger.log(`[Match ${matchId}] Batting record has player field: ${JSON.stringify(sampleBatting.player, null, 2)}`, 'SportsMonksService');
          }
        }
        if (Array.isArray(match.bowling) && match.bowling.length > 0) {
          const sampleBowling = match.bowling[0];
          this.logger.log(`[Match ${matchId}] Root bowling sample keys: ${Object.keys(sampleBowling).join(', ')}`, 'SportsMonksService');
          this.logger.log(`[Match ${matchId}] Root bowling sample: ${JSON.stringify(sampleBowling, null, 2)}`, 'SportsMonksService');
          // Check if player/bowler data is nested
          if (sampleBowling.bowler) {
            this.logger.log(`[Match ${matchId}] Bowling record has bowler field: ${JSON.stringify(sampleBowling.bowler, null, 2)}`, 'SportsMonksService');
          }
          if (sampleBowling.player) {
            this.logger.log(`[Match ${matchId}] Bowling record has player field: ${JSON.stringify(sampleBowling.player, null, 2)}`, 'SportsMonksService');
          }
        }
        
        // Check for partnership-related fields in API response
        const partnershipFields = ['partnership', 'current_partnership', 'partnership_runs', 'partnership_balls', 'partnership_rate'];
        const hasPartnershipField = partnershipFields.some(field => match[field] !== undefined);
        if (hasPartnershipField) {
          this.logger.log(`[Match ${matchId}] Found partnership fields: ${partnershipFields.filter(f => match[f] !== undefined).join(', ')}`, 'SportsMonksService');
          partnershipFields.forEach(field => {
            if (match[field] !== undefined) {
              this.logger.log(`[Match ${matchId}] ${field}: ${JSON.stringify(match[field])}`, 'SportsMonksService');
            }
          });
        } else {
          this.logger.log(`[Match ${matchId}] No partnership fields found in API response`, 'SportsMonksService');
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
      // Log 400 errors with more detail
      if (error.response?.status === 400) {
        this.logger.error(`[Match ${matchId}] 400 Bad Request - Error response: ${JSON.stringify(error.response?.data || {})}`, '', 'SportsMonksService');
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
      const apiToken = this.getApiToken('cricket');
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/players/${playerId}`, {
          params: {
            api_token: apiToken,
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

  async getCommentary(matchId: string, sport: Sport = 'cricket'): Promise<{ firstInnings: any[]; secondInnings: any[]; all: any[] }> {
    try {
      // No caching - always fetch fresh data
      const baseUrl = this.getBaseUrl(sport);
      
      // v2.0 API: Commentary is available through 'balls' include
      // Balls contain ball-by-ball data which can be used as commentary
      this.logger.log(`Fetching ball-by-ball data (commentary) for match ${matchId}`, 'SportsMonksService');
      
      // Try different include combinations - balls.scoreboard is not a valid include
      let balls: any[] = [];
      let response: any = null;
      
      // CRITICAL: Removed cache buster to allow Redis caching
      // Commentary data can be cached for 30-60 seconds to reduce API calls
      const apiToken = this.getApiToken(sport);
      
      // Check Redis cache first
      const cacheKey = `sportsmonks:commentary:${sport}:${matchId}`;
      const cachedData = await this.redisService.get(cacheKey);
      
      if (cachedData) {
        this.logger.log(`[Match ${matchId}] Returning cached commentary (cache hit)`, 'SportsMonksService');
        return JSON.parse(cachedData);
      }
      
      // First try: with all available includes
      try {
        response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
            params: {
              api_token: apiToken,
              include: 'balls.batsman,balls.bowler,balls.score,balls.batsmanout,balls.catchstump',
            },
          }),
        );
        balls = response.data?.data?.balls || [];
      } catch (error: any) {
        // If first attempt fails, try simpler includes
        if (error.response?.status === 400) {
          this.logger.warn(`First attempt failed, trying simpler includes for commentary`, 'SportsMonksService');
          try {
            response = await firstValueFrom(
              this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
                params: {
                  api_token: apiToken,
                  include: 'balls',
                },
              }),
            );
            balls = response.data?.data?.balls || [];
          } catch (retryError: any) {
            throw retryError; // Re-throw if retry also fails
          }
        } else {
          throw error; // Re-throw if it's not a 400 error
        }
      }
        
      if (balls.length > 0) {
        this.logger.log(`Found ${balls.length} ball-by-ball entries for commentary`, 'SportsMonksService');
        
        // Log sample ball structure to see what fields are available
        if (balls.length > 0) {
          const sampleBall = balls[0];
          this.logger.log(`[Match ${matchId}] Sample ball keys: ${Object.keys(sampleBall).join(', ')}`, 'SportsMonksService');
          if (sampleBall.scoreboard) {
            this.logger.log(`[Match ${matchId}] Sample ball has scoreboard field: ${sampleBall.scoreboard}`, 'SportsMonksService');
          }
        }
        
        // Group balls by scoreboard (S1 = first innings, S2 = second innings)
        const commentaryByInnings: { [key: string]: any[] } = {};
        
        balls.forEach((ball: any, index: number) => {
          // Get scoreboard identifier (S1, S2, etc.) - this identifies the innings
          // The scoreboard field should be directly on the ball object
          const scoreboard = ball.scoreboard || ball.scoreboard_id || 'S1'; // Default to S1 if not available
          const inningsKey = scoreboard.toString();
          
          // Parse over and ball number from ball.ball (which is a decimal like 19.6 = over 19, ball 6)
          let over = 0;
          let ballNumber = 0;
          
          if (ball.ball !== undefined && ball.ball !== null) {
            const ballValue = parseFloat(ball.ball.toString());
            if (!isNaN(ballValue)) {
              over = Math.floor(ballValue); // Integer part is the over
              ballNumber = Math.round((ballValue - over) * 10); // Decimal part * 10 is the ball number
            }
          }
          
          // If ball.over is provided separately, use it (but it might be 0 or undefined)
          if (ball.over !== undefined && ball.over !== null && ball.over > 0) {
            over = Math.floor(parseFloat(ball.over.toString()));
          }
          
          const commentaryEntry = {
            id: ball.id || index,
            over: over,
            ball: ball.ball || 0,
            ballNumber: ballNumber,
            runs: ball.score?.runs || 0,
            wickets: ball.score?.wickets || 0,
            isWicket: ball.batsmanout !== null || ball.catchstump !== null,
            batsman: ball.batsman?.name || ball.batsman?.fullname || '',
            bowler: ball.bowler?.name || ball.bowler?.fullname || '',
            commentary: this.generateCommentaryText(ball),
            timestamp: ball.updated_at || ball.created_at || new Date().toISOString(),
            scoreboard: inningsKey, // Include scoreboard identifier
          };
          
          if (!commentaryByInnings[inningsKey]) {
            commentaryByInnings[inningsKey] = [];
          }
          commentaryByInnings[inningsKey].push(commentaryEntry);
        });
        
        // Sort each innings' commentary by over and ball number (newest first) - Cricinfo style
        Object.keys(commentaryByInnings).forEach(key => {
          commentaryByInnings[key].sort((a: any, b: any) => {
            if (a.over !== b.over) return b.over - a.over; // Higher over first
            return b.ballNumber - a.ballNumber; // Higher ball number first
          });
        });
        
        // Return structured data with innings separated
        // S1 = First Innings, S2 = Second Innings
        const result = {
          firstInnings: commentaryByInnings['S1'] || [],
          secondInnings: commentaryByInnings['S2'] || [],
          all: Object.values(commentaryByInnings).flat().sort((a: any, b: any) => {
            // Sort all commentary by timestamp (newest first) for backward compatibility
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          }),
        };
        
        // Cache the result for 30 seconds to reduce API calls
        await this.redisService.set(cacheKey, JSON.stringify(result), 30);
        this.logger.log(`[Match ${matchId}] Cached commentary (30s TTL)`, 'SportsMonksService');
        
        return result;
      } else {
        this.logger.warn(`No ball-by-ball data available for match ${matchId}`, 'SportsMonksService');
        return {
          firstInnings: [],
          secondInnings: [],
          all: [],
        };
      }
    } catch (error: any) {
      this.logger.error(`Error fetching ${sport} commentary for ${matchId}`, error.stack, 'SportsMonksService');
      if (error.response?.status === 400) {
        this.logger.warn(`Balls include may not be available for this match or subscription`, 'SportsMonksService');
      }
      return {
        firstInnings: [],
        secondInnings: [],
        all: [],
      };
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

