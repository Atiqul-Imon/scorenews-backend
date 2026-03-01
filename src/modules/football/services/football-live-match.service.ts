import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { FootballMatch, FootballMatchDocument } from '../schemas/football-match.schema';
import { SportsMonksService } from '../../cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../../cricket/utils/match-transformers';
import { determineMatchStatus } from '../../cricket/utils/status-determiner';
import { WinstonLoggerService } from '../../../common/logger/winston-logger.service';

@Injectable()
export class FootballLiveMatchService {
  constructor(
    @InjectModel(FootballMatch.name) private footballMatchModel: Model<FootballMatchDocument>,
    private sportsMonksService: SportsMonksService,
    private configService: ConfigService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Get all live football matches from database
   */
  async getLiveMatches(): Promise<FootballMatch[]> {
    try {
      const matches = await this.footballMatchModel
        .find({ status: 'live' })
        .sort({ startTime: -1 })
        .lean();
      
      this.logger.log(`Found ${matches.length} live football matches in database`, 'FootballLiveMatchService');
      return matches as FootballMatch[];
    } catch (error: any) {
      this.logger.error('Error fetching live football matches from database', error.stack, 'FootballLiveMatchService');
      throw error;
    }
  }

  /**
   * Fetch live football matches from API and update database
   */
  async fetchAndUpdateLiveMatches(): Promise<FootballMatch[]> {
    try {
      this.logger.log('Fetching live football matches from SportsMonks API...', 'FootballLiveMatchService');
      
      // Try livescores endpoint
      let apiMatches: any[] = [];
      try {
        apiMatches = await this.sportsMonksService.getLiveMatches('football');
        this.logger.log(`Livescores endpoint returned ${apiMatches.length} football matches`, 'FootballLiveMatchService');
      } catch (error: any) {
        this.logger.warn(`Livescores endpoint failed: ${error.message}, using database only`, 'FootballLiveMatchService');
        return [];
      }

      // If no live matches from API, return empty
      if (apiMatches.length === 0) {
        this.logger.warn('No live football matches returned from API', 'FootballLiveMatchService');
        return [];
      }

      // Transform and filter matches
      const liveMatches: FootballMatch[] = [];
      
      for (const apiMatch of apiMatches) {
        try {
          // Log raw API match data for debugging
          this.logger.log(`Processing football match: id=${apiMatch.id}, state_id=${apiMatch.state_id}, status=${apiMatch.status}`, 'FootballLiveMatchService');
          
          // Use livescores data directly - no need for additional API calls
          let matchData = apiMatch;
          
          // Determine match status - PASS 'football' parameter for correct V3 handling
          const statusResult = determineMatchStatus(matchData, 'football');
          
          // Only process live matches
          if (statusResult.status !== 'live') {
            this.logger.log(`Skipping football match ${matchData.id}: ${statusResult.reason} (status: ${statusResult.status})`, 'FootballLiveMatchService');
            continue;
          }
          
          // Transform to frontend format
          let transformed;
          try {
            transformed = transformSportsMonksMatchToFrontend(matchData, 'football');
          } catch (transformError: any) {
            this.logger.error(`Transformer threw error for football match ${matchData.id}: ${transformError.message}`, transformError.stack, 'FootballLiveMatchService');
            continue;
          }
          
          if (!transformed || !transformed.matchId) {
            this.logger.warn(`Transformation failed for football match ${matchData.id}`, 'FootballLiveMatchService');
            continue;
          }
          
          this.logger.log(`Successfully transformed football match ${matchData.id} -> ${transformed.matchId}`, 'FootballLiveMatchService');
          
          // Convert to FootballMatch format
          const liveMatch: FootballMatch = {
            matchId: transformed.matchId,
            league: transformed.leagueName || transformed.series || 'Unknown League',
            season: transformed.seasonName || 'Unknown Season',
            teams: {
              home: {
                id: transformed.homeTeamId || transformed.teams?.home?.id || '',
                name: transformed.teams?.home?.name || 'Home Team',
                logo: transformed.homeTeamImagePath || transformed.teams?.home?.flag || '',
                shortName: transformed.homeTeamCode || transformed.teams?.home?.shortName || 'HOME',
              },
              away: {
                id: transformed.awayTeamId || transformed.teams?.away?.id || '',
                name: transformed.teams?.away?.name || 'Away Team',
                logo: transformed.awayTeamImagePath || transformed.teams?.away?.flag || '',
                shortName: transformed.awayTeamCode || transformed.teams?.away?.shortName || 'AWAY',
              },
            },
            venue: transformed.venue || {
              name: 'Unknown Venue',
              city: 'Unknown',
              country: 'Unknown',
            },
            status: 'live',
            startTime: transformed.startTime || new Date(),
            score: {
              home: transformed.currentScore?.home?.runs || transformed.currentScore?.home?.score || 0,
              away: transformed.currentScore?.away?.runs || transformed.currentScore?.away?.score || 0,
            },
            events: transformed.events || [],
            statistics: transformed.statistics,
          };

          // Save or update in database
          await this.saveOrUpdateLiveMatch(liveMatch);
          liveMatches.push(liveMatch);
        } catch (error: any) {
          this.logger.error(`Error processing football match ${apiMatch.id}: ${error.message}`, error.stack, 'FootballLiveMatchService');
        }
      }

      this.logger.log(`=== FOOTBALL LIVE MATCH FETCH SUMMARY ===`, 'FootballLiveMatchService');
      this.logger.log(`API returned: ${apiMatches.length} matches`, 'FootballLiveMatchService');
      this.logger.log(`Successfully processed and saved: ${liveMatches.length} live matches`, 'FootballLiveMatchService');
      if (apiMatches.length > liveMatches.length) {
        this.logger.warn(`Filtered out ${apiMatches.length - liveMatches.length} matches (not live or transformation failed)`, 'FootballLiveMatchService');
      }
      return liveMatches;
    } catch (error: any) {
      this.logger.error('Error fetching and updating live football matches', error.stack, 'FootballLiveMatchService');
      throw error;
    }
  }

  /**
   * Save or update live football match in database
   */
  async saveOrUpdateLiveMatch(match: FootballMatch): Promise<FootballMatch> {
    try {
      this.logger.log(`Saving live football match to database: matchId=${match.matchId}`, 'FootballLiveMatchService');
      
      const result = await this.footballMatchModel.findOneAndUpdate(
        { matchId: match.matchId },
        {
          $set: {
            matchId: match.matchId,
            league: match.league,
            season: match.season,
            teams: match.teams,
            venue: match.venue,
            status: match.status,
            startTime: match.startTime,
            score: match.score,
            events: match.events,
            statistics: match.statistics,
            updatedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        }
      ).lean();

      this.logger.log(`Saved/updated live football match ${match.matchId}`, 'FootballLiveMatchService');
      return result as FootballMatch;
    } catch (error: any) {
      this.logger.error(`Error saving live football match ${match.matchId}`, error.stack, 'FootballLiveMatchService');
      throw error;
    }
  }

  /**
   * Get live football match by ID
   */
  async getLiveMatchById(matchId: string): Promise<FootballMatch | null> {
    try {
      const match = await this.footballMatchModel.findOne({ matchId, status: 'live' }).lean();
      return match as FootballMatch | null;
    } catch (error: any) {
      this.logger.error(`Error fetching live football match ${matchId}`, error.stack, 'FootballLiveMatchService');
      return null;
    }
  }
}



