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

    // No caching - always fetch fresh data

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

    // No caching - return fresh data
    return result;
  }

  /**
   * Enrich player names in match data by fetching player details from API
   */
  private async enrichPlayerNames(matchData: any): Promise<any> {
    try {
      if (!matchData.batting && !matchData.bowling && !matchData.currentBatters && !matchData.currentBowlers && !matchData.lastWicket) {
        return matchData; // No player data to enrich
      }

      // Collect all unique player IDs
      const playerIds = new Set<string>();
      if (matchData.batting) {
        matchData.batting.forEach((b: any) => {
          if (b.playerId) playerIds.add(b.playerId);
        });
      }
      if (matchData.bowling) {
        matchData.bowling.forEach((b: any) => {
          if (b.playerId) playerIds.add(b.playerId);
        });
      }
      if (matchData.currentBatters) {
        matchData.currentBatters.forEach((b: any) => {
          if (b.playerId) playerIds.add(b.playerId);
        });
      }
      if (matchData.currentBowlers) {
        matchData.currentBowlers.forEach((b: any) => {
          if (b.playerId) playerIds.add(b.playerId);
        });
      }
      if (matchData.lastWicket && matchData.lastWicket.playerId) {
        playerIds.add(matchData.lastWicket.playerId);
      }

      if (playerIds.size === 0) {
        return matchData; // No player IDs to fetch
      }

      this.logger.log(`Enriching ${playerIds.size} player names for match ${matchData.matchId}`, 'CricketService');

      // Fetch player names in parallel
      const playerPromises = Array.from(playerIds).map(playerId => 
        this.sportsMonksService.getPlayerDetails(playerId)
          .then(player => ({ playerId, player }))
          .catch((error) => {
            this.logger.warn(`Failed to fetch player ${playerId}: ${error.message}`, 'CricketService');
            return { playerId, player: null };
          })
      );
      
      const playerData = await Promise.all(playerPromises);
      const playerMap = new Map<string, string>();
      
      playerData.forEach(({ playerId, player }) => {
        if (player) {
          const name = player.fullname || player.name || player.firstname || `Player ${playerId}`;
          playerMap.set(playerId, name);
          this.logger.log(`Fetched player name: ${playerId} -> ${name}`, 'CricketService');
        }
      });

      // Update player names in batting stats
      if (matchData.batting) {
        matchData.batting = matchData.batting.map((b: any) => ({
          ...b,
          playerName: playerMap.get(b.playerId) || b.playerName,
        }));
      }

      // Update player names in bowling stats
      if (matchData.bowling) {
        matchData.bowling = matchData.bowling.map((b: any) => ({
          ...b,
          playerName: playerMap.get(b.playerId) || b.playerName,
        }));
      }

      // Update player names in current batters
      if (matchData.currentBatters) {
        matchData.currentBatters = matchData.currentBatters.map((b: any) => ({
          ...b,
          playerName: playerMap.get(b.playerId) || b.playerName,
        }));
      }

      // Update player names in current bowlers
      if (matchData.currentBowlers) {
        matchData.currentBowlers = matchData.currentBowlers.map((b: any) => ({
          ...b,
          playerName: playerMap.get(b.playerId) || b.playerName,
        }));
      }

      // Update player name in last wicket
      if (matchData.lastWicket && matchData.lastWicket.playerId) {
        const lastWicketPlayerName = playerMap.get(matchData.lastWicket.playerId);
        if (lastWicketPlayerName) {
          matchData.lastWicket.playerName = lastWicketPlayerName;
        }
      }

      this.logger.log(`Enriched ${playerMap.size} player names for match ${matchData.matchId}`, 'CricketService');
      return matchData;
    } catch (error: any) {
      this.logger.error(`Error enriching player names for match ${matchData.matchId}: ${error.message}`, error.stack, 'CricketService');
      return matchData; // Return original data if enrichment fails
    }
  }

  /**
   * Calculate match result from match data (for database matches without result)
   */
  private calculateMatchResultFromData(matchData: any): any {
    try {
      if (!matchData.currentScore || matchData.status !== 'completed') {
        return undefined;
      }

      const homeRuns = matchData.currentScore.home?.runs || 0;
      const awayRuns = matchData.currentScore.away?.runs || 0;
      const homeWickets = matchData.currentScore.home?.wickets ?? 10;
      const awayWickets = matchData.currentScore.away?.wickets ?? 10;

      // Determine winner
      const homeWon = homeRuns > awayRuns;
      const winner = homeWon ? 'home' : 'away';
      const winnerName = homeWon ? matchData.teams.home.name : matchData.teams.away.name;
      const winnerScore = homeWon ? matchData.currentScore.home : matchData.currentScore.away;
      const winnerWickets = winnerScore?.wickets ?? 10;

      // Calculate margin
      const margin = Math.abs(homeRuns - awayRuns);
      let marginType: 'runs' | 'wickets' = 'runs';
      let resultText = '';

      // Determine batting order from innings data if available
      let firstInningsTeam: 'home' | 'away' | null = null;
      let secondInningsTeam: 'home' | 'away' | null = null;

      if (matchData.innings && matchData.innings.length >= 2) {
        // First innings is innings[0], second is innings[1]
        const firstInnings = matchData.innings[0];
        const secondInnings = matchData.innings[1];

        if (firstInnings.team === matchData.teams.home.name) {
          firstInningsTeam = 'home';
          secondInningsTeam = 'away';
        } else if (firstInnings.team === matchData.teams.away.name) {
          firstInningsTeam = 'away';
          secondInningsTeam = 'home';
        }
      }

      // Determine margin type based on batting order
      if (firstInningsTeam && secondInningsTeam) {
        // We know batting order
        if (winner === firstInningsTeam) {
          // Team batting first won - always by runs
          marginType = 'runs';
          resultText = `${winnerName} won by ${margin} runs`;
        } else {
          // Team batting second won
          if (winnerWickets < 10) {
            // Winner has wickets remaining - won by wickets
            const wicketsRemaining = 10 - winnerWickets;
            marginType = 'wickets';
            resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
          } else {
            // Winner lost all wickets but still won (rare) - won by runs
            marginType = 'runs';
            resultText = `${winnerName} won by ${margin} runs`;
          }
        }
      } else {
        // Fallback: Infer batting order from wickets
        // If winner has wickets remaining, they likely batted second
        if (winnerWickets < 10) {
          // Winner has wickets remaining - likely batted second and won by wickets
          const wicketsRemaining = 10 - winnerWickets;
          marginType = 'wickets';
          resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
        } else {
          // Winner lost all wickets - likely batted first and won by runs
          marginType = 'runs';
          resultText = `${winnerName} won by ${margin} runs`;
        }
      }

      return {
        winner,
        winnerName,
        margin,
        marginType,
        resultText,
      };
    } catch (error) {
      this.logger.error('Error calculating match result from data', error, 'CricketService');
      return undefined;
    }
  }

  /**
   * Save or update a match in the database
   * This method is called automatically when live matches are fetched
   */
  /**
   * Save or update a match in the database
   * When a match is completed, ensures all data including player names and results are saved
   */
  private async saveMatchToDatabase(matchData: any): Promise<void> {
    try {
      if (!matchData.matchId) {
        this.logger.warn('Cannot save match without matchId', 'CricketService');
        return;
      }

      // Check if both innings are complete (even if status is 'live')
      let finalStatus = matchData.status;
      let matchEnded = matchData.matchEnded || false;
      const isTransitioningToCompleted = finalStatus === 'completed' || matchEnded;
      
      if (matchData.currentScore && matchData.format) {
        const matchType = (matchData.format || '').toLowerCase();
        const isT20 = matchType.includes('t20');
        const isODI = matchType.includes('odi');
        const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;
        
        const homeAllOut = matchData.currentScore.home?.wickets >= 10;
        const awayAllOut = matchData.currentScore.away?.wickets >= 10;
        const homeReachedMax = maxOvers !== undefined && matchData.currentScore.home?.overs >= maxOvers;
        const awayReachedMax = maxOvers !== undefined && matchData.currentScore.away?.overs >= maxOvers;
        
        // If both innings are complete, mark as completed
        if ((homeAllOut && awayAllOut) || (homeReachedMax && awayReachedMax) || 
            (homeAllOut && awayReachedMax) || (homeReachedMax && awayAllOut)) {
          finalStatus = 'completed';
          matchEnded = true;
          this.logger.log(`Match ${matchData.matchId} marked as completed: both innings finished`, 'CricketService');
        }
      }

      // If match is transitioning to completed, ensure we have all data
      let dataToSave = matchData;
      if (finalStatus === 'completed' && !matchData.result && matchData.currentScore) {
        // Calculate result if not present
        const calculatedResult = this.calculateMatchResultFromData(matchData);
        if (calculatedResult) {
          dataToSave = { ...matchData, result: calculatedResult };
          this.logger.log(`Calculated result for completed match ${matchData.matchId}`, 'CricketService');
        }
      }

      // Prepare match data for database - ensure ALL fields are included
      const matchToSave: any = {
        matchId: dataToSave.matchId,
        series: dataToSave.series || 'Unknown Series',
        teams: dataToSave.teams,
        venue: dataToSave.venue,
        status: finalStatus,
        format: dataToSave.format,
        startTime: dataToSave.startTime ? new Date(dataToSave.startTime) : new Date(),
        currentScore: dataToSave.currentScore,
        innings: dataToSave.innings,
        name: dataToSave.name,
        matchNote: dataToSave.matchNote,
        round: dataToSave.round,
        tossWon: dataToSave.tossWon,
        elected: dataToSave.elected,
        target: dataToSave.target,
        endingAt: dataToSave.endingAt ? new Date(dataToSave.endingAt) : undefined,
        // Include all player-related data
        currentBatters: dataToSave.currentBatters,
        currentBowlers: dataToSave.currentBowlers,
        partnership: dataToSave.partnership,
        lastWicket: dataToSave.lastWicket,
        batting: dataToSave.batting,
        bowling: dataToSave.bowling,
        matchStarted: dataToSave.matchStarted || false,
        matchEnded: matchEnded,
        score: dataToSave.score,
        result: dataToSave.result, // Store calculated match result
      };

      // If match is completed, set endTime
      if (finalStatus === 'completed' && !matchToSave.endTime) {
        matchToSave.endTime = new Date();
      }

      // Use upsert to update if exists, insert if new
      await this.cricketMatchModel.findOneAndUpdate(
        { matchId: dataToSave.matchId },
        matchToSave,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      this.logger.log(`Saved/updated match ${dataToSave.matchId} (${finalStatus}) to database with ${matchToSave.batting?.length || 0} batting records and ${matchToSave.bowling?.length || 0} bowling records`, 'CricketService');
      
      // If match just transitioned to completed, log important data
      if (isTransitioningToCompleted && finalStatus === 'completed') {
        const matchData = {
          hasResult: !!matchToSave.result,
          hasBatting: !!matchToSave.batting && matchToSave.batting.length > 0,
          hasBowling: !!matchToSave.bowling && matchToSave.bowling.length > 0,
          hasInnings: !!matchToSave.innings && matchToSave.innings.length > 0,
          finalScore: matchToSave.currentScore,
        };
        this.logger.log(`✅ Match ${dataToSave.matchId} saved as COMPLETED with full data: ${JSON.stringify(matchData)}`, 'CricketService');
      }
    } catch (error: any) {
      this.logger.error(`Error saving match ${matchData.matchId} to database: ${error.message}`, error.stack, 'CricketService');
    }
  }

  async getLiveMatches() {
    try {
      // Try SportMonks first (primary - user has token)
      const sportMonksToken = this.configService.get<string>('SPORTMONKS_API_TOKEN');
      if (sportMonksToken) {
        try {
          this.logger.log('🔵 Fetching live cricket matches from SportMonks...', 'CricketService');
          const apiMatches = await this.sportsMonksService.getLiveMatches('cricket');
          this.logger.log(`🔵 SportMonks returned ${apiMatches.length} raw matches`, 'CricketService');
          
          if (apiMatches.length === 0) {
            this.logger.warn('⚠️  No raw matches returned from SportsMonks API!', 'CricketService');
            // Don't return empty array yet - try fallback APIs
          } else {
            // Log sample of raw matches for debugging
            const sampleRaw = apiMatches.slice(0, 3).map((m: any) => ({
              id: m.id,
              name: m.name || `${m.localteam?.name} vs ${m.visitorteam?.name}`,
              live: m.live,
              status: m.status,
              state_id: m.state_id,
              starting_at: m.starting_at,
            }));
            this.logger.log(`🔵 Sample raw matches from API: ${JSON.stringify(sampleRaw, null, 2)}`, 'CricketService');
          }
          
          const transformedMatches = apiMatches.map((match: any) => {
            try {
              const transformed = transformSportsMonksMatchToFrontend(match, 'cricket');
              if (!transformed) {
                this.logger.warn(`⚠️  Transformation returned null for match ${match.id}`, 'CricketService');
              }
              return transformed;
            } catch (error: any) {
              this.logger.error(`❌ Error transforming match ${match.id}: ${error.message}`, error.stack, 'CricketService');
              return null;
            }
          }).filter((m: any) => m !== null);
          
          this.logger.log(`🔵 Transformed ${transformedMatches.length} matches (from ${apiMatches.length} raw)`, 'CricketService');
          
          if (transformedMatches.length === 0 && apiMatches.length > 0) {
            this.logger.error(`❌ CRITICAL: All ${apiMatches.length} raw matches failed transformation!`, 'CricketService');
          }
          
          // Log sample of transformed matches with full details
          if (transformedMatches.length > 0) {
            const sampleTransformed = transformedMatches.slice(0, 3).map((m: any) => ({
              id: m.matchId,
              name: m.name,
              status: m.status,
              matchStarted: m.matchStarted,
              matchEnded: m.matchEnded,
              startTime: m.startTime,
              hasScore: !!(m.currentScore?.home?.runs > 0 || m.currentScore?.away?.runs > 0),
              currentScore: m.currentScore,
              format: m.format,
            }));
            this.logger.log(`Sample transformed matches: ${JSON.stringify(sampleTransformed, null, 2)}`, 'CricketService');
          } else {
            this.logger.warn(`No transformed matches! Raw matches: ${apiMatches.length}`, 'CricketService');
          }
          
          // Filter for live matches - be more lenient to catch all live matches
          // CRITICAL: Matches from livescores endpoint should be considered live by default
          // Only exclude matches that are explicitly completed or both innings finished
          const liveMatches = transformedMatches.filter((match) => {
            // First check: if status is explicitly completed AND match has ended, exclude
            if (match.status === 'completed' && match.matchEnded) {
              this.logger.log(`Excluding match ${match.matchId}: explicitly completed and ended`, 'CricketService');
              return false;
            }
            
            // CRITICAL: If status is 'live', always include (matches from livescores endpoint)
            // This is the most important check - matches from livescores are live by definition
            if (match.status === 'live') {
              // Only exclude if both innings are complete
              if (match.currentScore) {
                const matchType = (match.format || '').toLowerCase();
                const isT20 = matchType.includes('t20');
                const isODI = matchType.includes('odi');
                const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;
                
                const homeAllOut = match.currentScore.home?.wickets >= 10;
                const awayAllOut = match.currentScore.away?.wickets >= 10;
                const homeReachedMax = maxOvers !== undefined && match.currentScore.home?.overs >= maxOvers;
                const awayReachedMax = maxOvers !== undefined && match.currentScore.away?.overs >= maxOvers;
                
                // If both teams are all out OR both have reached max overs, exclude from live
                if ((homeAllOut && awayAllOut) || (homeReachedMax && awayReachedMax) || 
                    (homeAllOut && awayReachedMax) || (homeReachedMax && awayAllOut)) {
                  this.logger.log(`Excluding match ${match.matchId} from live: both innings complete`, 'CricketService');
                  return false;
                }
              }
              
              this.logger.log(`✅ Including match ${match.matchId} as live: status=live`, 'CricketService');
              return true;
            }
            
            // Third check: if match has started and not ended, include it
            if (match.matchStarted && !match.matchEnded) {
              this.logger.log(`✅ Including match ${match.matchId} as live: matchStarted=true, matchEnded=false`, 'CricketService');
              return true;
            }
            
            // Fourth check: if match has started (by time) and has score data, include it
            if (match.startTime && new Date(match.startTime) <= new Date() && !match.matchEnded) {
              // If match has score data, it's definitely live
              if (match.currentScore && (match.currentScore.home?.runs > 0 || match.currentScore.away?.runs > 0)) {
                this.logger.log(`✅ Including match ${match.matchId} as live: has started with score data`, 'CricketService');
                return true;
              }
              // If match started recently (within last 8 hours), consider it live
              const startTime = new Date(match.startTime);
              const hoursSinceStart = (Date.now() - startTime.getTime()) / (1000 * 60 * 60);
              if (hoursSinceStart <= 8 && hoursSinceStart >= 0) {
                this.logger.log(`✅ Including match ${match.matchId} as live: started ${hoursSinceStart.toFixed(1)} hours ago`, 'CricketService');
                return true;
              }
            }
            
            // Log why match was excluded (only in debug mode to avoid log spam)
            if (process.env.NODE_ENV === 'development') {
              this.logger.log(`Excluding match ${match.matchId}: status=${match.status}, matchStarted=${match.matchStarted}, matchEnded=${match.matchEnded}`, 'CricketService');
            }
            return false;
          });

          this.logger.log(`Found ${liveMatches.length} live matches after transformation`, 'CricketService');
          
          if (liveMatches.length > 0) {
            // Check for matches that transitioned from live to completed
            // Compare with database to detect newly completed matches
            const matchIds = liveMatches.map((m: any) => m.matchId);
            let existingMatches: any[] = [];
            let existingStatusMap = new Map<string, string>();
            
            try {
              existingMatches = await this.cricketMatchModel
                .find({ matchId: { $in: matchIds } })
                .select('matchId status')
                .lean();
              
              existingStatusMap = new Map(
                existingMatches.map((m: any) => [m.matchId, m.status])
              );
              this.logger.log(`Found ${existingMatches.length} existing matches in database for comparison`, 'CricketService');
            } catch (dbError: any) {
              this.logger.warn(`Error querying database for existing matches: ${dbError.message}`, 'CricketService');
              // Continue without database comparison - treat all as new
            }
            
            // Separate truly live matches from newly completed ones
            const stillLiveMatches: any[] = [];
            const newlyCompletedMatches: any[] = [];
            
            liveMatches.forEach((match) => {
              // Only check for completion transition if we have database data
              const previousStatus = existingStatusMap.get(match.matchId);
              const isNewlyCompleted = (match.status === 'completed' || match.matchEnded) && 
                                      previousStatus !== 'completed' &&
                                      previousStatus !== undefined; // Only if we had previous status
              
              if (isNewlyCompleted) {
                newlyCompletedMatches.push(match);
                this.logger.log(`Match ${match.matchId} transitioned to completed - will save to database`, 'CricketService');
              } else if (match.status !== 'completed' && !match.matchEnded) {
                // Include all matches that are not completed and not ended
                // This includes live matches and matches that just started
                stillLiveMatches.push(match);
                this.logger.log(`Match ${match.matchId} is live (status: ${match.status}, previousStatus: ${previousStatus || 'new'})`, 'CricketService');
              } else {
                this.logger.log(`Match ${match.matchId} excluded: status=${match.status}, matchEnded=${match.matchEnded}`, 'CricketService');
              }
            });
            
            this.logger.log(`Separated matches: ${stillLiveMatches.length} still live, ${newlyCompletedMatches.length} newly completed`, 'CricketService');
            
            // If no live matches after separation, something is wrong - log details
            if (stillLiveMatches.length === 0 && liveMatches.length > 0) {
              this.logger.error(`CRITICAL: All ${liveMatches.length} live matches were filtered out!`, 'CricketService');
              const details = liveMatches.map((m: any) => ({
                id: m.matchId,
                name: m.name,
                status: m.status,
                matchStarted: m.matchStarted,
                matchEnded: m.matchEnded,
                currentScore: m.currentScore,
              }));
              this.logger.error(`Filtered matches details: ${JSON.stringify(details, null, 2)}`, 'CricketService');
            }
            
            // CRITICAL: Return live matches immediately without waiting for enrichment
            // Enrichment and database saves happen in background
            // This ensures frontend gets live data quickly from SportsMonks API
            
            // Create a copy of live matches to return (don't wait for enrichment)
            const liveMatchesToReturn = stillLiveMatches.map((match) => {
              // Return match as-is, enrichment will happen in background
              return {
                ...match,
                // Ensure all required fields are present
                _id: match._id || match.matchId,
                matchId: match.matchId,
                status: match.status || 'live',
              };
            });
            
            this.logger.log(`✅ Returning ${liveMatchesToReturn.length} live matches immediately (from ${stillLiveMatches.length} still live matches)`, 'CricketService');
            
            if (liveMatchesToReturn.length > 0) {
              const sample = liveMatchesToReturn.slice(0, 3).map((m: any) => ({
                id: m.matchId,
                status: m.status,
                name: m.name,
                teams: `${m.teams?.home?.name} vs ${m.teams?.away?.name}`,
                started: m.matchStarted,
                ended: m.matchEnded,
                hasScore: !!(m.currentScore?.home?.runs > 0 || m.currentScore?.away?.runs > 0),
                score: m.currentScore ? `${m.currentScore.home?.runs || 0}/${m.currentScore.home?.wickets || 0} vs ${m.currentScore.away?.runs || 0}/${m.currentScore.away?.wickets || 0}` : 'No score',
              }));
              this.logger.log(`Live matches to return: ${JSON.stringify(sample, null, 2)}`, 'CricketService');
            } else {
              this.logger.error(`❌ CRITICAL: No live matches to return! stillLiveMatches.length=${stillLiveMatches.length}`, 'CricketService');
            }
            
            // Enrich and save in background (don't block the return)
            const stillLiveMatchIds = new Set(stillLiveMatches.map((m: any) => m.matchId));
            const allMatches = [...stillLiveMatches, ...newlyCompletedMatches];
            
            // Start enrichment in background
            Promise.all(
              allMatches.map((match) => this.enrichPlayerNames(match))
            ).then((enrichedMatches) => {
              // For completed matches, ensure result is calculated before saving
              const matchesToSave = enrichedMatches.map((match) => {
                if (match.status === 'completed' && !match.result && match.currentScore) {
                  const calculatedResult = this.calculateMatchResultFromData(match);
                  if (calculatedResult) {
                    match.result = calculatedResult;
                  }
                }
                return match;
              });
              
              // Save newly completed matches to database
              const completedToSave = matchesToSave.filter((match) => 
                newlyCompletedMatches.some((m: any) => m.matchId === match.matchId)
              );
              
              if (completedToSave.length > 0) {
                this.logger.log(`Saving ${completedToSave.length} newly completed match(es) to database`, 'CricketService');
                Promise.all(
                  completedToSave.map((match) => this.saveMatchToDatabase(match))
                ).then(() => {
                  this.logger.log(`✅ Successfully saved ${completedToSave.length} completed match(es) to MongoDB`, 'CricketService');
                }).catch((error) => {
                  this.logger.error('Error saving completed matches', error, 'CricketService');
                });
              }
              
              // Save/update live matches to database asynchronously
              const liveMatchesToSave = matchesToSave.filter((match) => 
                stillLiveMatchIds.has(match.matchId)
              );
              
              if (liveMatchesToSave.length > 0) {
                Promise.all(
                  liveMatchesToSave.map((match) => this.saveMatchToDatabase(match))
                ).catch((error) => {
                  this.logger.error('Error saving live matches to database', error, 'CricketService');
                });
              }
            }).catch((error) => {
              this.logger.error('Error enriching player names (non-blocking)', error, 'CricketService');
            });
            
            // Return immediately - don't wait for enrichment or database saves
            return liveMatchesToReturn;
          } else if (transformedMatches.length > 0) {
            // Log what we got if no live matches found
            const sample = transformedMatches.slice(0, 3).map((m: any) => ({
              id: m.matchId,
              status: m.status,
              name: m.name,
              started: m.matchStarted,
              ended: m.matchEnded,
            }));
            this.logger.warn(`No live matches found, but got ${transformedMatches.length} matches. Sample: ${JSON.stringify(sample, null, 2)}`, 'CricketService');
            // Still save any matches to database even if not live (they might be completed)
            Promise.all(
              transformedMatches.map((match: any) => this.saveMatchToDatabase(match))
            ).catch((error) => {
              this.logger.error('Error saving matches to database', error, 'CricketService');
            });
            return [];
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
          return liveMatches;
        }
      } catch (cricketApiError) {
        this.logger.error('All APIs failed, using database fallback', cricketApiError, 'CricketService');
      }

      // Final fallback: database
      // Filter out matches where both innings are complete, even if status is 'live'
      const dbMatches = await this.cricketMatchModel.find({ status: 'live' }).sort({ startTime: -1 }).lean();
      const filteredDbMatches = dbMatches.filter((match: any) => {
        // Check if both innings are complete
        if (match.currentScore) {
          const matchType = (match.format || '').toLowerCase();
          const isT20 = matchType.includes('t20');
          const isODI = matchType.includes('odi');
          const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;
          
          const homeAllOut = match.currentScore.home?.wickets >= 10;
          const awayAllOut = match.currentScore.away?.wickets >= 10;
          const homeReachedMax = maxOvers !== undefined && match.currentScore.home?.overs >= maxOvers;
          const awayReachedMax = maxOvers !== undefined && match.currentScore.away?.overs >= maxOvers;
          
          // If both innings are complete, exclude from live
          if ((homeAllOut && awayAllOut) || (homeReachedMax && awayReachedMax) || 
              (homeAllOut && awayReachedMax) || (homeReachedMax && awayAllOut)) {
            // Update status in database asynchronously
            this.cricketMatchModel.updateOne(
              { matchId: match.matchId },
              { $set: { status: 'completed', matchEnded: true } }
            ).catch((err) => {
              this.logger.error(`Error updating match ${match.matchId} status to completed`, err, 'CricketService');
            });
            return false;
          }
        }
        return true;
      });
      return filteredDbMatches;
    } catch (error: any) {
      this.logger.error('Error fetching live cricket matches', error.stack, 'CricketService');
      const dbMatches = await this.cricketMatchModel.find({ status: 'live' }).sort({ startTime: -1 }).lean();
      return dbMatches;
    }
  }

  async getFixtures(filters: GetMatchesDto) {
    const { page = 1, limit = 20, format, series, startDate, endDate } = filters;

    try {
      // No caching - always fetch fresh data
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
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      let filteredMatches = transformedMatches.filter((match) => {
        const matchDate = new Date(match.startTime);
        // Only include matches in the next 24 hours
        const isUpcoming = match.status === 'upcoming' || (!match.matchStarted && !match.matchEnded && matchDate > now);
        return isUpcoming && matchDate <= twentyFourHoursFromNow;
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

      // Don't use demo matches - only show real data from API
      // If no matches from API, return empty array
      if (filteredMatches.length === 0) {
        this.logger.log('No upcoming matches found from API', 'CricketService');
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

      // No caching - return fresh data
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
      // ALWAYS prioritize database for completed matches
      // This ensures we show data from our own database once matches are saved
      const skip = (page - 1) * limit;
      const dbFilter: any = { status: 'completed' };
      if (format) dbFilter.format = format;
      if (series) dbFilter.series = new RegExp(series, 'i');
      if (startDate || endDate) {
        dbFilter.startTime = {};
        if (startDate) dbFilter.startTime.$gte = new Date(startDate);
        if (endDate) dbFilter.startTime.$lte = new Date(endDate);
      }

      const dbMatches = await this.cricketMatchModel
        .find(dbFilter)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const dbTotal = await this.cricketMatchModel.countDocuments(dbFilter);

      // If we have matches in database, use them (even if only a few)
      if (dbMatches.length > 0) {
        this.logger.log(`Found ${dbMatches.length} completed matches in database (total: ${dbTotal})`, 'CricketService');
        
        // Calculate results for matches that don't have them
        const matchesWithResults = await Promise.all(
          dbMatches.map(async (match: any) => {
            if (!match.result && match.currentScore) {
              const calculatedResult = this.calculateMatchResultFromData(match);
              if (calculatedResult) {
                // Update database with calculated result (async)
                this.cricketMatchModel.updateOne(
                  { matchId: match.matchId },
                  { $set: { result: calculatedResult } }
                ).catch((err) => {
                  this.logger.error(`Error updating match ${match.matchId} result`, err, 'CricketService');
                });
                match.result = calculatedResult;
              }
            }
            return match;
          })
        );
        
        // Return database matches (our own data)
        return {
          success: true,
          data: {
            results: matchesWithResults,
            pagination: {
              current: page,
              pages: Math.ceil(dbTotal / limit),
              total: dbTotal,
              limit,
            },
          },
        };
      }

      // Only fetch from API if database is completely empty
      // This should rarely happen once matches start being saved
      this.logger.log('No completed matches in database, fetching from SportsMonks API as fallback...', 'CricketService');

      let apiMatches: any[] = [];
      try {
        apiMatches = await this.sportsMonksService.getCompletedMatches('cricket');
      } catch (error: any) {
        this.logger.warn('SportMonks completed matches failed, using demo data', 'CricketService');
      }

      const transformedMatches = apiMatches.map((match: any) =>
        transformSportsMonksMatchToFrontend(match, 'cricket'),
      );
      
      // Log transformation results for debugging
      this.logger.log(`Transformed ${transformedMatches.length} matches. Status breakdown: ${transformedMatches.map((m: any) => m.status).join(', ')}`, 'CricketService');
      
      const completedMatches = transformedMatches.filter(
        (match) => match.status === 'completed' || match.matchEnded,
      );
      
      // Enrich player names and save all completed matches to database
      let matchesToUse = completedMatches;
      if (completedMatches.length > 0) {
        // Enrich player names for completed matches (in batches to avoid too many API calls)
        const enrichedMatches = await Promise.all(
          completedMatches.map((match) => this.enrichPlayerNames(match))
        );
        
        // Calculate and add result for matches that don't have it
        const matchesWithResults = enrichedMatches.map((match) => {
          if (match.status === 'completed' && !match.result && match.currentScore) {
            const calculatedResult = this.calculateMatchResultFromData(match);
            if (calculatedResult) {
              match.result = calculatedResult;
            }
          }
          return match;
        });
        
        // Save enriched matches to database (async, don't wait)
        Promise.all(
          matchesWithResults.map((match) => this.saveMatchToDatabase(match))
        ).catch((error) => {
          this.logger.error('Error saving completed matches to database', error, 'CricketService');
        });
        
        // Use enriched matches
        matchesToUse = matchesWithResults.filter(
          (match) => match.status === 'completed' || match.matchEnded,
        );
      }
      
      // If no matches after status filter, try to include all transformed matches
      // (the service already filtered for completed, so all should be completed)
      if (completedMatches.length === 0 && transformedMatches.length > 0 && matchesToUse.length === 0) {
        this.logger.warn(`No matches with status='completed' after transformation, but ${transformedMatches.length} matches were returned from API. Using all transformed matches and marking as completed.`, 'CricketService');
        // Force all matches to be marked as completed since they came from getCompletedMatches
        transformedMatches.forEach((match: any) => {
          match.status = 'completed';
          match.matchEnded = true;
        });
        matchesToUse = transformedMatches;
      }

      // Filter to show matches from last 14 days for recent results
      // Reasonable window to catch all types of cricket matches (international, domestic, etc.)
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const currentYear = now.getFullYear();
      
      let filteredMatches = matchesToUse.filter((match) => {
        if (!match.startTime) {
          this.logger.warn('Match missing startTime, skipping:', match.matchId || match._id, 'CricketService');
          return false;
        }
        const matchDate = new Date(match.startTime);
        
        // Validate date is not in the future
        if (matchDate > now) {
          return false;
        }
        
        // Show matches from last 14 days
        if (matchDate < fourteenDaysAgo) {
          return false;
        }
        
        // Additional validation: match must be from current year or last year
        const matchYear = matchDate.getFullYear();
        if (matchYear < currentYear - 1) {
          this.logger.warn(`Skipping old match from ${matchYear}:`, match.matchId || match._id, 'CricketService');
          return false;
        }
        
        return true;
      });
      
      // Log what types of matches we have
      if (filteredMatches.length > 0) {
        const matchTypes = filteredMatches.map((m: any) => ({
          series: m.series || 'Unknown',
          format: m.format || 'Unknown',
          date: m.startTime,
        }));
        this.logger.log(`Match types found: ${JSON.stringify(matchTypes.slice(0, 5), null, 2)}`, 'CricketService');
      }
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

      // Don't use demo matches - only show real data from API
      // If no matches in last 14 days, return empty array (don't show old matches)
      if (filteredMatches.length === 0) {
        this.logger.warn(`No completed matches found in last 14 days from API. Total completed matches from API: ${matchesToUse.length}`, 'CricketService');
        if (matchesToUse.length > 0) {
          const sampleDates = matchesToUse.slice(0, 5).map((m: any) => {
            const date = m.startTime ? new Date(m.startTime) : null;
            return date ? `${date.toISOString().split('T')[0]} (${date.getFullYear()})` : 'no date';
          });
          this.logger.warn(`Sample match dates: ${sampleDates.join(', ')}`, 'CricketService');
        }
      } else {
        this.logger.log(`Found ${filteredMatches.length} completed matches in last 14 days after filtering`, 'CricketService');
      }

      const apiSkip = (page - 1) * limit;
      const paginatedMatches = filteredMatches.slice(apiSkip, apiSkip + limit);
      const total = filteredMatches.length;

      const result = {
        success: true,
        data: {
          results: paginatedMatches,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total,
            limit,
          },
        },
      };

      // No caching - return fresh data
      return result;
    } catch (error: any) {
      this.logger.error('Error fetching results from API', error.stack, 'CricketService');

      const fallbackSkip = (page - 1) * limit;
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
        .skip(fallbackSkip)
        .limit(limit)
        .lean();

      const total = await this.cricketMatchModel.countDocuments(filter);

      return {
        success: true,
        data: {
          results: results || [],
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total: total || 0,
            limit,
          },
        },
      };
    }
  }

  async getMatchById(id: string) {
    try {
      // First, check database for the match
      this.logger.log(`Checking database for match ${id}...`, 'CricketService');
      const dbMatch = await this.cricketMatchModel.findOne({ matchId: id }).lean();
      
      if (dbMatch) {
        this.logger.log(`Found match ${id} in database (status: ${dbMatch.status})`, 'CricketService');
        
        // If match is live, try to get fresh data from API and update database
        if (dbMatch.status === 'live') {
          try {
            this.logger.log(`Match ${id} is live, fetching fresh data from API...`, 'CricketService');
            const apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
            if (apiMatch && apiMatch.id) {
              const transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
              
              // Log current batters/bowlers and batting/bowling data for debugging
              this.logger.log(`Match ${id} transformed - currentBatters: ${transformedMatch.currentBatters?.length || 0}, currentBowlers: ${transformedMatch.currentBowlers?.length || 0}`, 'CricketService');
              this.logger.log(`Match ${id} transformed - batting: ${transformedMatch.batting?.length || 0}, bowling: ${transformedMatch.bowling?.length || 0}`, 'CricketService');
              
              // Enrich player names before returning
              const enrichedMatch = await this.enrichPlayerNames(transformedMatch);
              
              // Update database with fresh data (async, don't wait)
              this.saveMatchToDatabase(enrichedMatch).catch((error) => {
                this.logger.error(`Error saving match ${id} to database`, error, 'CricketService');
              });
              
              // Return fresh data with enriched player names
              return enrichedMatch;
            }
          } catch (apiError: any) {
            this.logger.warn(`Could not fetch fresh data for live match ${id}, using database data`, 'CricketService');
          }
        }
        
        // If match is completed but doesn't have result calculated, calculate it
        if (dbMatch.status === 'completed' && !dbMatch.result && dbMatch.currentScore) {
          // Calculate result using innings data if available, otherwise use currentScore
          const calculatedResult = this.calculateMatchResultFromData(dbMatch);
          if (calculatedResult) {
            // Update database with calculated result (async)
            this.cricketMatchModel.updateOne(
              { matchId: id },
              { $set: { result: calculatedResult } }
            ).catch((err) => {
              this.logger.error(`Error updating match ${id} result`, err, 'CricketService');
            });
            dbMatch.result = calculatedResult;
          }
        }
        
        // Enrich player names for database match (especially if it's live and API failed)
        const enrichedDbMatch = await this.enrichPlayerNames(dbMatch);
        return enrichedDbMatch;
      }

      // Match not in database, try API
      this.logger.log(`Match ${id} not in database, fetching from SportsMonks API...`, 'CricketService');

      try {
        // Try to get match details from API (works for both live and completed matches)
        let apiMatch: any = null;
        try {
          apiMatch = await this.sportsMonksService.getMatchDetails(id, 'cricket');
        } catch (apiError: any) {
          // If direct match details fails, try searching in completed matches
          this.logger.log(`Direct match fetch failed for ${id}, trying completed matches search...`, 'CricketService');
          try {
            const completedMatches = await this.sportsMonksService.getCompletedMatches('cricket');
            apiMatch = completedMatches.find((m: any) => m.id?.toString() === id.toString() || m.fixture_id?.toString() === id.toString());
            if (apiMatch) {
              this.logger.log(`Found match ${id} in completed matches`, 'CricketService');
            }
          } catch (completedError: any) {
            this.logger.warn(`Could not find match ${id} in completed matches either`, 'CricketService');
          }
        }
        
        // Check if API returned valid match data
        if (!apiMatch || !apiMatch.id) {
          this.logger.warn(`No match data returned from API for ${id}`, 'CricketService');
          throw new NotFoundException(`Match with ID ${id} not found`);
          } else {
            let transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
            
            // Log batting/bowling data for debugging
            if (transformedMatch.batting) {
              this.logger.log(`Match ${id} has ${transformedMatch.batting.length} batting records`, 'CricketService');
            }
            if (transformedMatch.bowling) {
              this.logger.log(`Match ${id} has ${transformedMatch.bowling.length} bowling records`, 'CricketService');
            }
            
            // Validate transformed match has required fields
            if (!transformedMatch || !transformedMatch.matchId) {
              this.logger.warn(`Failed to transform match data for ${id}, trying database fallback...`, 'CricketService');
              // Don't throw here, fall through to database fallback
            } else {
              // Successfully got match from API, enrich player names first
            const enrichedMatch = await this.enrichPlayerNames(transformedMatch);
            
            // Save match to database (async, don't wait) - save after enriching
            this.saveMatchToDatabase(enrichedMatch).catch((error) => {
              this.logger.error(`Error saving match ${id} to database`, error, 'CricketService');
            });

            // No caching - return fresh data with enriched player names
            return enrichedMatch;
          }
        }
      } catch (apiError: any) {
        this.logger.warn(`Error fetching match from API for ${id}: ${apiError.message}, trying database fallback...`, 'CricketService');
        // Fall through to database fallback
      }

      // Fallback to database - try both matchId and _id
      this.logger.log(`Trying database fallback for match ${id}...`, 'CricketService');
      let match = await this.cricketMatchModel.findOne({ matchId: id }).lean();
      
      if (!match) {
        // Try finding by _id if id looks like MongoDB ObjectId
        try {
          match = await this.cricketMatchModel.findById(id).lean();
        } catch (e) {
          // Ignore ObjectId cast errors
        }
      }

      // If found in database, return it (even if it's completed)
      if (match) {
        this.logger.log(`Found match ${id} in database`, 'CricketService');
        return match;
      }

      // Last attempt: Try to fetch from completed matches API and save to database
      this.logger.log(`Trying to fetch match ${id} from completed matches API...`, 'CricketService');
      try {
        const completedMatches = await this.sportsMonksService.getCompletedMatches('cricket');
        const foundMatch = completedMatches.find((m: any) => 
          m.id?.toString() === id.toString() || 
          m.fixture_id?.toString() === id.toString()
        );
        
        if (foundMatch) {
          this.logger.log(`Found match ${id} in completed matches, transforming and saving...`, 'CricketService');
          const transformedMatch = transformSportsMonksMatchToFrontend(foundMatch, 'cricket');
          
          // Save to database for future access
          if (transformedMatch && transformedMatch.matchId) {
            try {
              await this.cricketMatchModel.findOneAndUpdate(
                { matchId: transformedMatch.matchId },
                transformedMatch,
                { upsert: true, new: true }
              );
              this.logger.log(`Saved match ${id} to database`, 'CricketService');
            } catch (saveError: any) {
              this.logger.warn(`Failed to save match ${id} to database: ${saveError.message}`, 'CricketService');
            }
          }
          
          return transformedMatch;
        }
      } catch (completedError: any) {
        this.logger.warn(`Could not fetch from completed matches: ${completedError.message}`, 'CricketService');
      }

      // If all attempts fail, throw NotFoundException
      throw new NotFoundException('Cricket match not found');
    } catch (error: any) {
      // If it's already a NotFoundException, re-throw it
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Error fetching match details for ${id}`, error.stack, 'CricketService');
      
      // Last resort: try database one more time
      try {
        let match = await this.cricketMatchModel.findOne({ matchId: id }).lean();
        if (!match) {
          match = await this.cricketMatchModel.findById(id).lean();
        }
        if (match) {
          return match;
        }
      } catch (dbError) {
        // Ignore database errors
      }
      
      throw new NotFoundException('Cricket match not found');
    }
  }

  async getCommentary(id: string) {
    try {
      // No caching - always fetch fresh data
      this.logger.log(`Fetching cricket commentary from SportsMonks for ${id}...`, 'CricketService');

      const commentary = await this.sportsMonksService.getCommentary(id, 'cricket');
      // No caching - return fresh data
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

  async getTeamMatches(teamName: string) {
    try {
      // Decode team name from URL format
      const decodedTeamName = decodeURIComponent(teamName).replace(/-/g, ' ');
      
      // Find all matches where this team participated
      const matches = await this.cricketMatchModel
        .find({
          $or: [
            { 'teams.home.name': { $regex: new RegExp(decodedTeamName, 'i') } },
            { 'teams.away.name': { $regex: new RegExp(decodedTeamName, 'i') } },
          ],
        })
        .sort({ startTime: -1 })
        .limit(50)
        .lean();

      // Aggregate batting and bowling stats for this team
      const battingStats: any[] = [];
      const bowlingStats: any[] = [];
      const matchIds: string[] = [];

      for (const match of matches) {
        matchIds.push(match.matchId);
        
        // Try to get detailed match data from API
        try {
          const detailedMatch = await this.getMatchById(match.matchId);
          
          if (detailedMatch.batting) {
            const teamBatting = detailedMatch.batting
              .filter((b: any) => b.teamName && b.teamName.toLowerCase().includes(decodedTeamName.toLowerCase()))
              .map((b: any) => ({ ...b, matchId: match.matchId }));
            battingStats.push(...teamBatting);
          }
          
          if (detailedMatch.bowling) {
            const teamBowling = detailedMatch.bowling
              .filter((b: any) => b.teamName && b.teamName.toLowerCase().includes(decodedTeamName.toLowerCase()))
              .map((b: any) => ({ ...b, matchId: match.matchId }));
            bowlingStats.push(...teamBowling);
          }
        } catch (error) {
          // If detailed match fetch fails, skip
          this.logger.warn(`Failed to fetch details for match ${match.matchId}`, 'CricketService');
        }
      }

      // Aggregate batting stats by player
      const battingAggregated = battingStats.reduce((acc: any, stat: any) => {
        const key = stat.playerId || stat.playerName;
        if (!acc[key]) {
          acc[key] = {
            playerId: stat.playerId,
            playerName: stat.playerName,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            matches: new Set(),
            strikeRate: 0,
            isOut: 0,
          };
        }
        acc[key].runs += stat.runs || 0;
        acc[key].balls += stat.balls || 0;
        acc[key].fours += stat.fours || 0;
        acc[key].sixes += stat.sixes || 0;
        acc[key].matches.add(stat.matchId || 'unknown');
        if (stat.isOut) acc[key].isOut += 1;
        return acc;
      }, {});

      // Aggregate bowling stats by player
      const bowlingAggregated = bowlingStats.reduce((acc: any, stat: any) => {
        const key = stat.playerId || stat.playerName;
        if (!acc[key]) {
          acc[key] = {
            playerId: stat.playerId,
            playerName: stat.playerName,
            overs: 0,
            maidens: 0,
            runs: 0,
            wickets: 0,
            matches: new Set(),
            economy: 0,
          };
        }
        acc[key].overs += stat.overs || 0;
        acc[key].maidens += stat.maidens || 0;
        acc[key].runs += stat.runs || 0;
        acc[key].wickets += stat.wickets || 0;
        acc[key].matches.add(stat.matchId || 'unknown');
        return acc;
      }, {});

      // Convert to arrays and calculate averages
      const battingArray = Object.values(battingAggregated).map((stat: any) => ({
        ...stat,
        matches: stat.matches.size,
        strikeRate: stat.balls > 0 ? ((stat.runs / stat.balls) * 100).toFixed(2) : '0.00',
        average: stat.isOut > 0 ? (stat.runs / stat.isOut).toFixed(2) : stat.runs > 0 ? '∞' : '0.00',
      }));

      const bowlingArray = Object.values(bowlingAggregated).map((stat: any) => ({
        ...stat,
        matches: stat.matches.size,
        economy: stat.overs > 0 ? (stat.runs / stat.overs).toFixed(2) : '0.00',
        average: stat.wickets > 0 ? (stat.runs / stat.wickets).toFixed(2) : '0.00',
      }));

      return {
        success: true,
        data: {
          teamName: decodedTeamName,
          matches: matches.length,
          batting: battingArray.sort((a: any, b: any) => b.runs - a.runs).slice(0, 20),
          bowling: bowlingArray.sort((a: any, b: any) => b.wickets - a.wickets).slice(0, 20),
          recentMatches: matches.slice(0, 10).map((m: any) => ({
            matchId: m.matchId,
            name: m.name,
            status: m.status,
            startTime: m.startTime,
            teams: m.teams,
          })),
        },
      };
    } catch (error: any) {
      this.logger.error(`Error fetching team matches for ${teamName}`, error.stack, 'CricketService');
      throw error;
    }
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
