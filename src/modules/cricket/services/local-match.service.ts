import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocalMatch, LocalMatchDocument } from '../schemas/local-match.schema';
import { CreateLocalMatchDto } from '../dto/create-local-match.dto';
import { UpdateLocalMatchScoreDto } from '../dto/update-local-match-score.dto';
import { RecordBallDto } from '../dto/record-ball.dto';
import { MatchSetupDto } from '../dto/match-setup.dto';
import * as crypto from 'crypto';

@Injectable()
export class LocalMatchService {
  private readonly logger = new Logger(LocalMatchService.name);

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

    this.logger.log(`Creating match document with matchId: ${matchId}`);
    
    try {
      const match = new this.localMatchModel(matchData);
      const savedMatch = await match.save();
      
      this.logger.log(`Match saved successfully to database: ${matchId}`);
      this.logger.debug(`Match document: ${JSON.stringify(savedMatch.toObject(), null, 2)}`);

      return savedMatch.toObject();
    } catch (error: any) {
      this.logger.error(`Error saving match to database: ${error.message}`, error.stack);
      
      // Check for duplicate key error
      if (error.code === 11000) {
        throw new BadRequestException(`Match with ID ${matchId} already exists`);
      }
      
      throw error;
    }
  }

  /**
   * Get match by ID
   * @param matchId - Match ID
   * @param includeUnverified - If true, include unverified matches (for admin). Default: false (public only shows verified)
   */
  async getMatchById(matchId: string, includeUnverified: boolean = false): Promise<LocalMatch> {
    const query: any = { matchId };
    
    // Public endpoints only show verified matches unless explicitly requested
    if (!includeUnverified) {
      query.isVerified = true;
    }
    
    const match = await this.localMatchModel.findOne(query).lean();
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
   * @param filters - Filter options
   * @param includeUnverified - If true, include unverified matches (for admin). Default: false (public only shows verified)
   */
  async getLocalMatches(
    filters?: {
      city?: string;
      district?: string;
      area?: string;
      status?: string;
      limit?: number;
    },
    includeUnverified: boolean = false,
  ): Promise<LocalMatch[]> {
    const query: any = { isLocalMatch: true };

    // Public endpoints only show verified matches unless explicitly requested
    if (!includeUnverified) {
      query.isVerified = true;
    }

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
   * Complete match setup (playing XI, toss, opening batters, first bowler)
   */
  async completeMatchSetup(matchId: string, setupDto: MatchSetupDto, scorerId: string): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only setup matches you created');
    }

    if (match.status !== 'upcoming') {
      throw new BadRequestException('Match setup can only be done for upcoming matches');
    }

    // Store match setup
    match.matchSetup = {
      isSetupComplete: true,
      tossWinner: setupDto.toss.winner,
      tossDecision: setupDto.toss.decision,
      homePlayingXI: setupDto.homePlayingXI,
      awayPlayingXI: setupDto.awayPlayingXI,
    };

    // Determine batting team based on toss
    const battingTeam = setupDto.toss.decision === 'bat' ? setupDto.toss.winner : setupDto.toss.winner === 'home' ? 'away' : 'home';

    // Initialize live state
    match.liveState = {
      currentInnings: 1,
      battingTeam,
      strikerId: setupDto.openingBatter1Id,
      nonStrikerId: setupDto.openingBatter2Id,
      bowlerId: setupDto.firstBowlerId,
      currentOver: 0,
      currentBall: 0,
      isInningsBreak: false,
    };

    // Initialize batting and bowling stats
    match.battingStats = [];
    match.bowlingStats = [];

    // Change status to live
    match.status = 'live';
    match.scorerInfo.lastUpdate = new Date();

    await match.save();
    return match.toObject();
  }

  /**
   * Record a ball (ball-by-ball scoring)
   */
  async recordBall(matchId: string, ballDto: RecordBallDto, scorerId: string): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only score matches you created');
    }

    if (match.isLocked) {
      throw new BadRequestException('Match is locked and cannot be edited');
    }

    if (!match.liveState) {
      throw new BadRequestException('Match setup must be completed before scoring');
    }

    // Validate ball data
    if (ballDto.ball < 0 || ballDto.ball > 5) {
      throw new BadRequestException('Ball number must be between 0 and 5');
    }

    // Create ball record
    const ballRecord = {
      innings: ballDto.innings,
      over: ballDto.over,
      ball: ballDto.ball,
      strikerId: ballDto.strikerId,
      nonStrikerId: ballDto.nonStrikerId,
      bowlerId: ballDto.bowlerId,
      runs: ballDto.delivery.runs,
      ballType: ballDto.delivery.ballType,
      isWicket: ballDto.delivery.isWicket || false,
      dismissalType: ballDto.delivery.dismissalType,
      dismissedBatterId: ballDto.delivery.dismissedBatterId,
      fielderId: ballDto.delivery.fielderId,
      incomingBatterId: ballDto.delivery.incomingBatterId,
      isBoundary: ballDto.delivery.isBoundary || false,
      isSix: ballDto.delivery.isSix || false,
      timestamp: ballDto.timestamp ? new Date(ballDto.timestamp) : new Date(),
    };

    // Add to ball history
    if (!match.ballHistory) {
      match.ballHistory = [];
    }
    match.ballHistory.push(ballRecord);

    // Update current score
    const battingTeam = match.liveState.battingTeam || 'home';
    const bowlingTeam = battingTeam === 'home' ? 'away' : 'home';

    if (!match.currentScore) {
      match.currentScore = {
        home: { runs: 0, wickets: 0, overs: 0, balls: 0 },
        away: { runs: 0, wickets: 0, overs: 0, balls: 0 },
      };
    }

    // Calculate runs to add (extras add 1, normal runs add the run value)
    let runsToAdd = ballDto.delivery.runs;
    if (ballDto.delivery.ballType === 'wide' || ballDto.delivery.ballType === 'no_ball') {
      runsToAdd = 1; // Extras always add 1 run
    }

    // Update batting team score
    match.currentScore[battingTeam].runs += runsToAdd;
    if (ballDto.delivery.isWicket) {
      match.currentScore[battingTeam].wickets += 1;
    }

    // Update overs and balls
    // Wides and no-balls don't count as legal deliveries
    if (ballDto.delivery.ballType !== 'wide' && ballDto.delivery.ballType !== 'no_ball') {
      match.currentScore[battingTeam].balls += 1;
      if (match.currentScore[battingTeam].balls >= 6) {
        match.currentScore[battingTeam].overs += 1;
        match.currentScore[battingTeam].balls = 0;
      }
    }

    // Update live state
    let nextOver = ballDto.over;
    let nextBall = ballDto.ball;

    // Handle strike rotation
    let newStrikerId = ballDto.strikerId;
    let newNonStrikerId = ballDto.nonStrikerId;

    // If wicket, incoming batter becomes striker
    if (ballDto.delivery.isWicket && ballDto.delivery.incomingBatterId) {
      newStrikerId = ballDto.delivery.incomingBatterId;
    } else if (ballDto.delivery.ballType !== 'wide' && ballDto.delivery.ballType !== 'no_ball') {
      // Normal delivery - check for strike rotation
      if (ballDto.delivery.runs % 2 === 1) {
        // Odd runs - swap strike
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
    }

    // Increment ball (if not wide/no-ball)
    if (ballDto.delivery.ballType !== 'wide' && ballDto.delivery.ballType !== 'no_ball') {
      nextBall += 1;
      if (nextBall >= 6) {
        nextOver += 1;
        nextBall = 0;
        // End of over - swap strike
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
    }

    match.liveState.currentOver = nextOver;
    match.liveState.currentBall = nextBall;
    match.liveState.strikerId = newStrikerId;
    match.liveState.nonStrikerId = newNonStrikerId;

    // Update scorer info
    match.scorerInfo.lastUpdate = new Date();

    await match.save();
    return match.toObject();
  }

  /**
   * Undo last ball
   */
  async undoLastBall(matchId: string, scorerId: string): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only undo balls in matches you created');
    }

    if (match.isLocked) {
      throw new BadRequestException('Match is locked and cannot be edited');
    }

    if (!match.ballHistory || match.ballHistory.length === 0) {
      throw new BadRequestException('No balls to undo');
    }

    // Remove last ball
    const lastBall = match.ballHistory.pop()!;

    // Revert score
    const battingTeam = match.liveState?.battingTeam || 'home';

    // Calculate runs to subtract
    let runsToSubtract = lastBall.runs;
    if (lastBall.ballType === 'wide' || lastBall.ballType === 'no_ball') {
      runsToSubtract = 1;
    }

    if (match.currentScore) {
      match.currentScore[battingTeam].runs = Math.max(0, match.currentScore[battingTeam].runs - runsToSubtract);
      if (lastBall.isWicket) {
        match.currentScore[battingTeam].wickets = Math.max(0, match.currentScore[battingTeam].wickets - 1);
      }

      // Revert overs and balls
      if (lastBall.ballType !== 'wide' && lastBall.ballType !== 'no_ball') {
        if (match.currentScore[battingTeam].balls === 0) {
          match.currentScore[battingTeam].overs = Math.max(0, match.currentScore[battingTeam].overs - 1);
          match.currentScore[battingTeam].balls = 5;
        } else {
          match.currentScore[battingTeam].balls = Math.max(0, match.currentScore[battingTeam].balls - 1);
        }
      }
    }

    // Revert live state
    if (match.liveState) {
      match.liveState.currentOver = lastBall.over;
      match.liveState.currentBall = lastBall.ball;
    }

    match.scorerInfo.lastUpdate = new Date();
    await match.save();
    return match.toObject();
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

