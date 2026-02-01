import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocalMatch, LocalMatchDocument } from '../schemas/local-match.schema';
import { CreateLocalMatchDto } from '../dto/create-local-match.dto';
import { UpdateLocalMatchScoreDto } from '../dto/update-local-match-score.dto';
import * as crypto from 'crypto';

@Injectable()
export class LocalMatchService {
  constructor(
    @InjectModel(LocalMatch.name) private localMatchModel: Model<LocalMatchDocument>,
  ) {}

  /**
   * Generate unique match ID for local matches
   */
  private generateMatchId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `LOCAL-${timestamp}-${random}`;
  }

  /**
   * Generate team ID from team name
   */
  private generateTeamId(teamName: string): string {
    const normalized = teamName.toLowerCase().replace(/\s+/g, '-');
    const hash = crypto.createHash('md5').update(teamName).digest('hex').substring(0, 8);
    return `TEAM-${normalized}-${hash}`;
  }

  /**
   * Get short name from team name
   */
  private getShortName(teamName: string): string {
    const words = teamName.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].substring(0, 3).toUpperCase();
    }
    return words.map(w => w[0]).join('').toUpperCase().substring(0, 4);
  }

  /**
   * Create a new local match
   */
  async createMatch(createDto: CreateLocalMatchDto, scorerId: string, scorerName: string, scorerType: string): Promise<LocalMatch> {
    // Generate match ID
    const matchId = this.generateMatchId();

    // Generate team IDs and short names
    const homeTeamId = this.generateTeamId(createDto.teams.home);
    const awayTeamId = this.generateTeamId(createDto.teams.away);

    // Validate teams are different
    if (createDto.teams.home.toLowerCase().trim() === createDto.teams.away.toLowerCase().trim()) {
      throw new BadRequestException('Home and away teams must be different');
    }

    // Validate start time is in the future (or allow past for testing)
    const startTime = new Date(createDto.startTime);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid start time format');
    }

    // Create match document
    const matchData: Partial<LocalMatch> = {
      matchId,
      series: createDto.series,
      format: createDto.format,
      startTime,
      status: startTime > new Date() ? 'upcoming' : 'live',
      teams: {
        home: {
          id: homeTeamId,
          name: createDto.teams.home.trim(),
          flag: '',
          shortName: this.getShortName(createDto.teams.home),
        },
        away: {
          id: awayTeamId,
          name: createDto.teams.away.trim(),
          flag: '',
          shortName: this.getShortName(createDto.teams.away),
        },
      },
      venue: {
        name: createDto.venue.name.trim(),
        city: createDto.venue.city.trim(),
        country: (createDto.venue as any).country?.trim() || createDto.location.country.trim(),
        address: createDto.venue.address?.trim(),
      },
      localLocation: {
        country: createDto.location.country.trim(),
        state: createDto.location.state?.trim(),
        city: createDto.location.city.trim(),
        district: createDto.location.district?.trim(),
        area: createDto.location.area?.trim(),
      },
      localLeague: createDto.league ? {
        id: createDto.league.id,
        name: createDto.league.name.trim(),
        level: createDto.league.level,
        season: createDto.league.season.trim(),
        year: createDto.league.year,
      } : undefined,
      scorerInfo: {
        scorerId,
        scorerName,
        scorerType: scorerType as 'official' | 'volunteer' | 'community',
        lastUpdate: new Date(),
        verificationStatus: 'pending',
      },
      isVerified: false,
      isLocalMatch: true,
      matchType: 'local',
      currentScore: {
        home: { runs: 0, wickets: 0, overs: 0, balls: 0 },
        away: { runs: 0, wickets: 0, overs: 0, balls: 0 },
      },
    };

    const match = new this.localMatchModel(matchData);
    await match.save();

    return match.toObject();
  }

  /**
   * Get match by ID
   */
  async getMatchById(matchId: string): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId }).lean();
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }
    return match as LocalMatch;
  }

  /**
   * Update match score
   */
  async updateScore(
    matchId: string,
    updateDto: UpdateLocalMatchScoreDto,
    scorerId: string,
  ): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    // Check if scorer owns this match
    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only update matches you created');
    }

    // Validate score data
    if (updateDto.home.wickets > 10 || updateDto.away.wickets > 10) {
      throw new BadRequestException('Wickets cannot exceed 10');
    }

    if (updateDto.home.balls !== undefined && updateDto.home.balls > 5) {
      throw new BadRequestException('Balls in over cannot exceed 5');
    }

    if (updateDto.away.balls !== undefined && updateDto.away.balls > 5) {
      throw new BadRequestException('Balls in over cannot exceed 5');
    }

    // Update score
    match.currentScore = {
      home: {
        runs: updateDto.home.runs,
        wickets: updateDto.home.wickets,
        overs: updateDto.home.overs,
        balls: updateDto.home.balls ?? 0,
      },
      away: {
        runs: updateDto.away.runs,
        wickets: updateDto.away.wickets,
        overs: updateDto.away.overs,
        balls: updateDto.away.balls ?? 0,
      },
    };

    // Update status to live if it was upcoming
    if (match.status === 'upcoming') {
      match.status = 'live';
    }

    // Update match note if provided
    if (updateDto.matchNote) {
      match.matchNote = updateDto.matchNote;
    }

    // Update scorer info
    match.scorerInfo.lastUpdate = new Date();

    await match.save();

    return match.toObject();
  }

  /**
   * Get matches by scorer ID
   */
  async getMatchesByScorer(
    scorerId: string,
    filters?: {
      status?: 'upcoming' | 'live' | 'completed';
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ matches: LocalMatch[]; total: number; page: number; limit: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = { 'scorerInfo.scorerId': scorerId };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      query.startTime = {};
      if (filters.startDate) {
        query.startTime.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.startTime.$lte = new Date(filters.endDate);
      }
    }

    const [matches, total] = await Promise.all([
      this.localMatchModel
        .find(query)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.localMatchModel.countDocuments(query),
    ]);

    return {
      matches: matches as LocalMatch[],
      total,
      page,
      limit,
    };
  }

  /**
   * Get local matches with filters
   */
  async getLocalMatches(filters?: {
    city?: string;
    district?: string;
    area?: string;
    status?: string;
    limit?: number;
  }): Promise<LocalMatch[]> {
    const query: any = { isLocalMatch: true };

    if (filters?.city) {
      query['localLocation.city'] = new RegExp(filters.city, 'i');
    }

    if (filters?.district) {
      query['localLocation.district'] = new RegExp(filters.district, 'i');
    }

    if (filters?.area) {
      query['localLocation.area'] = new RegExp(filters.area, 'i');
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    const limit = filters?.limit || 50;

    const matches = await this.localMatchModel
      .find(query)
      .sort({ startTime: -1 })
      .limit(limit)
      .lean();

    return matches as LocalMatch[];
  }

  /**
   * Complete a match
   */
  async completeMatch(matchId: string, scorerId: string): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    // Check if scorer owns this match
    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only complete matches you created');
    }

    match.status = 'completed';
    match.endTime = new Date();
    match.scorerInfo.lastUpdate = new Date();

    await match.save();

    return match.toObject();
  }
}

