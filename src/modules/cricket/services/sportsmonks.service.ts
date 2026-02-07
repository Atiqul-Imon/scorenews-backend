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
      // NOTE: The /livescores endpoint has very limited allowed includes
      // Even basic batting/bowling might not be allowed - use only core includes
      // We'll fetch full match details later using getMatchDetails() to get complete player data
      // For /livescores, use only the most basic includes that are definitely allowed
      const includeParam = sport === 'cricket' 
        ? 'scoreboards,localteam,visitorteam,venue' 
        : 'scores,participants';
      
      if (!this.apiToken) {
        this.logger.error('SPORTMONKS_API_TOKEN is missing!', '', 'SportsMonksService');
        throw new Error('SportsMonks API token is not configured');
      }
      
      this.logger.log(`Calling v2.0 API: ${endpoint}`, 'SportsMonksService');
      
      // Add timestamp to prevent caching - ensure fresh data for current batters/bowlers
      const timestamp = Date.now();
      
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          params: {
            api_token: this.apiToken,
            include: includeParam,
            _t: timestamp, // Cache buster
          },
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
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
        // Log COMPLETE structure of first match to see ALL available fields
        const firstMatch = matches[0];
        this.logger.log(`=== COMPLETE SPORTSMONKS V2 API RESPONSE STRUCTURE ===`, 'SportsMonksService');
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
      const includeParam = sport === 'cricket' ? 'scoreboards,localteam,visitorteam,venue,batting.player,bowling.player' : 'scores,participants';
      
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
      // No caching - always fetch fresh data
      const baseUrl = this.getBaseUrl(sport);
      
      // CRITICAL: For live matches, use /livescores endpoint first (more real-time)
      // Then fall back to /fixtures/{id} if not found in livescores
      // The /livescores endpoint is updated more frequently than /fixtures/{id}
      let match: any = null;
      let response: any = null;
      
      // Add timestamp to prevent caching - ensure fresh data
      const timestamp = Date.now();
      
      // Strategy 1: Try /livescores endpoint first (more real-time for live matches)
      if (sport === 'cricket') {
        try {
          this.logger.log(`[Match ${matchId}] Attempting to fetch from /livescores endpoint (more real-time)...`, 'SportsMonksService');
          const livescoresResponse = await firstValueFrom(
            this.httpService.get(`${baseUrl}/livescores`, {
              params: {
                api_token: this.apiToken,
                include: 'scoreboards,localteam,visitorteam,venue',
                _t: timestamp,
              },
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
              },
            }),
          );
          
          const livescoresMatches = livescoresResponse.data?.data || [];
          const liveMatch = livescoresMatches.find((m: any) => m.id?.toString() === matchId.toString());
          
          if (liveMatch) {
            this.logger.log(`[Match ${matchId}] Found in /livescores endpoint, fetching full details...`, 'SportsMonksService');
            match = liveMatch;
            // Now fetch full details with batting/bowling from /fixtures/{id}
            // But we'll use the scoreboards from /livescores which are more up-to-date
          } else {
            this.logger.log(`[Match ${matchId}] Not found in /livescores, will try /fixtures/{id}...`, 'SportsMonksService');
          }
        } catch (livescoresError: any) {
          this.logger.warn(`[Match ${matchId}] /livescores endpoint failed: ${livescoresError.message}, will try /fixtures/{id}...`, 'SportsMonksService');
        }
      }
      
      // Strategy 2: Fetch full details from /fixtures/{id} (has batting/bowling data)
      // If we found match in livescores, we'll merge the scoreboards from livescores with full details from fixtures
      // v2.0 uses different includes than v3
      // Include batting and bowling for detailed match statistics
      // For SportMonks v2.0 cricket API, use simpler include format
      // v2.0 supports: scoreboards (which includes batting/bowling), batting, bowling separately
      // Try to include batting/bowling data with player details
      // NOTE: The /fixtures/{id} endpoint may reject certain include parameters
      // Strategy: Try nested includes first, then batting/bowling without .player, then simpler includes
      
      // Try 1: Include batting.batsman,bowling.bowler (v2.0 API uses batsman/bowler, not player)
      // According to v2.0 API docs, the correct includes are batting.batsman and bowling.bowler
      let includeParam = sport === 'cricket' 
        ? 'localteam,visitorteam,scoreboards,batting.batsman,bowling.bowler,venue,league,season' 
        : 'scores,participants,lineups,events';
      
      try {
        response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
            params: {
              api_token: this.apiToken,
              include: includeParam,
              _t: timestamp, // Cache buster
            },
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }),
        );
        const fixturesMatch = response.data?.data;
        
        // CRITICAL: If we found match in livescores, prefer its scoreboards (more up-to-date)
        // But use batting/bowling and other details from fixtures
        if (match && fixturesMatch) {
          this.logger.log(`[Match ${matchId}] Merging /livescores scoreboards with /fixtures/{id} full details...`, 'SportsMonksService');
          match = {
            ...fixturesMatch,
            // Prefer scoreboards from livescores (more real-time)
            scoreboards: match.scoreboards || fixturesMatch.scoreboards,
            // But keep status from livescores if it's more recent
            status: match.status || fixturesMatch.status,
            live: match.live !== undefined ? match.live : fixturesMatch.live,
          };
        } else {
          match = fixturesMatch || match;
        }
        
        this.logger.log(`[Match ${matchId}] Successfully fetched with nested player includes`, 'SportsMonksService');
      } catch (firstError: any) {
        // If 400 error, try without nested .player includes
        if (firstError.response?.status === 400) {
          this.logger.warn(`[Match ${matchId}] 400 error with nested includes: ${includeParam}, trying batting.batsman/bowling.bowler...`, 'SportsMonksService');
          
          // Try 2: Include batting.batsman,bowling.bowler (v2.0 API format)
          const battingBowlingInclude = sport === 'cricket' 
            ? 'localteam,visitorteam,scoreboards,batting.batsman,bowling.bowler,venue,league,season' 
            : 'scores,participants,lineups,events';
          
          try {
            response = await firstValueFrom(
              this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
                params: {
                  api_token: this.apiToken,
                  include: battingBowlingInclude,
                  _t: timestamp, // Cache buster
                },
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0',
                },
              }),
            );
            match = response.data?.data;
            this.logger.log(`[Match ${matchId}] Successfully fetched with batting.batsman/bowling.bowler includes`, 'SportsMonksService');
          } catch (secondError: any) {
            // If that also fails, try with batting/bowling without any nested includes
            if (secondError.response?.status === 400) {
              this.logger.warn(`[Match ${matchId}] 400 error with batting.batsman/bowling.bowler includes, trying batting/bowling without nested includes...`, 'SportsMonksService');
              
              // Try 3: Include batting,bowling (without any nested includes)
              const simpleBattingBowlingInclude = sport === 'cricket' 
                ? 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season' 
                : 'scores,participants,lineups,events';
          
              try {
                response = await firstValueFrom(
                  this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
                    params: {
                      api_token: this.apiToken,
                      include: simpleBattingBowlingInclude,
                      _t: timestamp, // Cache buster
                    },
                    headers: {
                      'Cache-Control': 'no-cache, no-store, must-revalidate',
                      'Pragma': 'no-cache',
                      'Expires': '0',
                    },
                  }),
                );
                match = response.data?.data;
                this.logger.log(`[Match ${matchId}] Successfully fetched with batting/bowling (without nested includes)`, 'SportsMonksService');
              } catch (thirdError: any) {
                // If that also fails, try with simplest includes (no batting/bowling)
                if (thirdError.response?.status === 400) {
                  this.logger.warn(`[Match ${matchId}] 400 error with batting/bowling includes, trying simplest includes...`, 'SportsMonksService');
                  const simpleIncludeParam = sport === 'cricket' 
                    ? 'localteam,visitorteam,scoreboards,venue' 
                    : 'scores,participants';
                  try {
                    response = await firstValueFrom(
                      this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
                        params: {
                          api_token: this.apiToken,
                          include: simpleIncludeParam,
                          _t: timestamp, // Cache buster
                        },
                        headers: {
                          'Cache-Control': 'no-cache, no-store, must-revalidate',
                          'Pragma': 'no-cache',
                          'Expires': '0',
                        },
                      }),
                    );
                    match = response.data?.data;
                    this.logger.log(`[Match ${matchId}] Successfully fetched with simplest includes (no batting/bowling)`, 'SportsMonksService');
                  } catch (fourthError: any) {
                    this.logger.error(`[Match ${matchId}] All retry attempts failed. Last error: ${fourthError.response?.status} - ${JSON.stringify(fourthError.response?.data || {})}`, '', 'SportsMonksService');
                    throw firstError; // Throw original error
                  }
                } else {
                  throw thirdError;
                }
              }
            } else {
              throw secondError;
            }
          }
        } else {
          throw firstError;
        }
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
      
      // Add timestamp to prevent caching - ensure fresh commentary data
      const timestamp = Date.now();
      
      // First try: with all available includes
      try {
        response = await firstValueFrom(
          this.httpService.get(`${baseUrl}/fixtures/${matchId}`, {
            params: {
              api_token: this.apiToken,
              include: 'balls.batsman,balls.bowler,balls.score,balls.batsmanout,balls.catchstump',
              _t: timestamp, // Cache buster
            },
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
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
                  api_token: this.apiToken,
                  include: 'balls',
                  _t: timestamp, // Cache buster
                },
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0',
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
        return {
          firstInnings: commentaryByInnings['S1'] || [],
          secondInnings: commentaryByInnings['S2'] || [],
          all: Object.values(commentaryByInnings).flat().sort((a: any, b: any) => {
            // Sort all commentary by timestamp (newest first) for backward compatibility
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          }),
        };
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

