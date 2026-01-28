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
   * Save or update a match in the database
   * This method is called automatically when live matches are fetched
   */
  private async saveMatchToDatabase(matchData: any): Promise<void> {
    try {
      if (!matchData.matchId) {
        this.logger.warn('Cannot save match without matchId', 'CricketService');
        return;
      }

      // Prepare match data for database
      const matchToSave: any = {
        matchId: matchData.matchId,
        series: matchData.series || 'Unknown Series',
        teams: matchData.teams,
        venue: matchData.venue,
        status: matchData.status,
        format: matchData.format,
        startTime: matchData.startTime ? new Date(matchData.startTime) : new Date(),
        currentScore: matchData.currentScore,
        innings: matchData.innings,
        name: matchData.name,
        matchNote: matchData.matchNote,
        round: matchData.round,
        tossWon: matchData.tossWon,
        elected: matchData.elected,
        target: matchData.target,
        endingAt: matchData.endingAt ? new Date(matchData.endingAt) : undefined,
        currentBatters: matchData.currentBatters,
        currentBowlers: matchData.currentBowlers,
        partnership: matchData.partnership,
        lastWicket: matchData.lastWicket,
        batting: matchData.batting,
        bowling: matchData.bowling,
        matchStarted: matchData.matchStarted || false,
        matchEnded: matchData.matchEnded || false,
        score: matchData.score,
      };

      // If match is completed, set endTime
      if (matchData.status === 'completed' && !matchToSave.endTime) {
        matchToSave.endTime = new Date();
      }

      // Use upsert to update if exists, insert if new
      await this.cricketMatchModel.findOneAndUpdate(
        { matchId: matchData.matchId },
        matchToSave,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      this.logger.log(`Saved/updated match ${matchData.matchId} (${matchData.status}) to database`, 'CricketService');
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
          this.logger.log('Fetching live cricket matches from SportMonks...', 'CricketService');
          const apiMatches = await this.sportsMonksService.getLiveMatches('cricket');
          this.logger.log(`SportMonks returned ${apiMatches.length} raw matches`, 'CricketService');
          
          const transformedMatches = apiMatches.map((match: any) =>
            transformSportsMonksMatchToFrontend(match, 'cricket'),
          );
          
          // Filter for live matches - be more lenient to catch all live matches
          const liveMatches = transformedMatches.filter((match) => {
            const isLive = match.status === 'live' || 
                          (match.matchStarted && !match.matchEnded) ||
                          (match.startTime && new Date(match.startTime) <= new Date() && !match.matchEnded);
            return isLive;
          });

          this.logger.log(`Found ${liveMatches.length} live matches after transformation`, 'CricketService');
          
          // Save all live matches to database
          if (liveMatches.length > 0) {
            // Save matches to database asynchronously (don't wait)
            Promise.all(
              liveMatches.map((match) => this.saveMatchToDatabase(match))
            ).catch((error) => {
              this.logger.error('Error saving live matches to database', error, 'CricketService');
            });

            const sample = liveMatches.slice(0, 3).map((m: any) => ({
              id: m.matchId,
              status: m.status,
              name: m.name,
              started: m.matchStarted,
              ended: m.matchEnded,
            }));
            this.logger.log(`Sample live matches: ${JSON.stringify(sample, null, 2)}`, 'CricketService');
            return liveMatches;
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
      // First, try to get completed matches from database
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

      // If we have matches in database, return them
      if (dbMatches.length > 0) {
        this.logger.log(`Found ${dbMatches.length} completed matches in database`, 'CricketService');
        return {
          success: true,
          data: {
            results: dbMatches,
            pagination: {
              current: page,
              pages: Math.ceil(dbTotal / limit),
              total: dbTotal,
              limit,
            },
          },
        };
      }

      // No matches in database, fetch from API and save them
      this.logger.log('No completed matches in database, fetching from SportsMonks API...', 'CricketService');

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
      
      // Save all completed matches to database (async, don't wait)
      if (completedMatches.length > 0) {
        Promise.all(
          completedMatches.map((match) => this.saveMatchToDatabase(match))
        ).catch((error) => {
          this.logger.error('Error saving completed matches to database', error, 'CricketService');
        });
      }
      
      // If no matches after status filter, try to include all transformed matches
      // (the service already filtered for completed, so all should be completed)
      let matchesToUse = completedMatches;
      if (completedMatches.length === 0 && transformedMatches.length > 0) {
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
              // Update database with fresh data
              await this.saveMatchToDatabase(transformedMatch);
              // Return fresh data
              return transformedMatch;
            }
          } catch (apiError: any) {
            this.logger.warn(`Could not fetch fresh data for live match ${id}, using database data`, 'CricketService');
          }
        }
        
        // Return database match (either completed or live if API failed)
        return dbMatch;
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
          
          // Validate transformed match has required fields
          if (!transformedMatch || !transformedMatch.matchId) {
            this.logger.warn(`Failed to transform match data for ${id}, trying database fallback...`, 'CricketService');
            // Don't throw here, fall through to database fallback
          } else {
            // Successfully got match from API, save to database and enrich
            // Save match to database (async, don't wait)
            this.saveMatchToDatabase(transformedMatch).catch((error) => {
              this.logger.error(`Error saving match ${id} to database`, error, 'CricketService');
            });

            // Enrich player names if batting/bowling data exists
            if (transformedMatch.batting || transformedMatch.bowling || transformedMatch.currentBatters || transformedMatch.currentBowlers || transformedMatch.lastWicket) {
              // Collect all unique player IDs
              const playerIds = new Set<string>();
              if (transformedMatch.batting) {
                transformedMatch.batting.forEach((b: any) => {
                  if (b.playerId) playerIds.add(b.playerId);
                });
              }
              if (transformedMatch.bowling) {
                transformedMatch.bowling.forEach((b: any) => {
                  if (b.playerId) playerIds.add(b.playerId);
                });
              }
              if (transformedMatch.currentBatters) {
                transformedMatch.currentBatters.forEach((b: any) => {
                  if (b.playerId) playerIds.add(b.playerId);
                });
              }
              if (transformedMatch.currentBowlers) {
                transformedMatch.currentBowlers.forEach((b: any) => {
                  if (b.playerId) playerIds.add(b.playerId);
                });
              }
              if (transformedMatch.lastWicket && transformedMatch.lastWicket.playerId) {
                playerIds.add(transformedMatch.lastWicket.playerId);
              }

              // Fetch player names in parallel
              const playerPromises = Array.from(playerIds).map(playerId => 
                this.sportsMonksService.getPlayerDetails(playerId)
                  .then(player => ({ playerId, player }))
                  .catch(() => ({ playerId, player: null }))
              );
              
              const playerData = await Promise.all(playerPromises);
              const playerMap = new Map<string, string>();
              
              playerData.forEach(({ playerId, player }) => {
                if (player) {
                  const name = player.fullname || player.name || player.firstname || `Player ${playerId}`;
                  playerMap.set(playerId, name);
                }
              });

              // Update player names in batting stats
              if (transformedMatch.batting) {
                transformedMatch.batting = transformedMatch.batting.map((b: any) => ({
                  ...b,
                  playerName: playerMap.get(b.playerId) || b.playerName,
                }));
              }

              // Update player names in bowling stats
              if (transformedMatch.bowling) {
                transformedMatch.bowling = transformedMatch.bowling.map((b: any) => ({
                  ...b,
                  playerName: playerMap.get(b.playerId) || b.playerName,
                }));
              }

              // Update player names in current batters
              if (transformedMatch.currentBatters) {
                transformedMatch.currentBatters = transformedMatch.currentBatters.map((b: any) => ({
                  ...b,
                  playerName: playerMap.get(b.playerId) || b.playerName,
                }));
              }

              // Update player names in current bowlers
              if (transformedMatch.currentBowlers) {
                transformedMatch.currentBowlers = transformedMatch.currentBowlers.map((b: any) => ({
                  ...b,
                  playerName: playerMap.get(b.playerId) || b.playerName,
                }));
              }

              // Update player name in last wicket
              if (transformedMatch.lastWicket && transformedMatch.lastWicket.playerId) {
                const lastWicketPlayerName = playerMap.get(transformedMatch.lastWicket.playerId);
                if (lastWicketPlayerName) {
                  transformedMatch.lastWicket.playerName = lastWicketPlayerName;
                }
              }
            }

            // No caching - return fresh data
            return transformedMatch;
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
