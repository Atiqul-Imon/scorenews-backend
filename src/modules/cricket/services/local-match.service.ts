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

    // Update live state if provided (for manual score entry with player changes)
    if (updateDto.liveState && match.liveState) {
      if (updateDto.liveState.strikerId !== undefined) {
        match.liveState.strikerId = updateDto.liveState.strikerId;
      }
      if (updateDto.liveState.nonStrikerId !== undefined) {
        match.liveState.nonStrikerId = updateDto.liveState.nonStrikerId;
      }
      if (updateDto.liveState.bowlerId !== undefined) {
        match.liveState.bowlerId = updateDto.liveState.bowlerId;
      }
      if (updateDto.liveState.currentOver !== undefined) {
        match.liveState.currentOver = updateDto.liveState.currentOver;
      }
      if (updateDto.liveState.currentBall !== undefined) {
        match.liveState.currentBall = updateDto.liveState.currentBall;
      }
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

    // Allow setup/updates for upcoming or live matches (scorer can update details anytime)
    if (match.status === 'completed' || match.status === 'cancelled') {
      throw new BadRequestException('Cannot update setup for completed or cancelled matches');
    }

    // Store match setup (merge with existing if any)
    match.matchSetup = {
      isSetupComplete: true,
      tossWinner: setupDto.toss?.winner || match.matchSetup?.tossWinner,
      tossDecision: setupDto.toss?.decision || match.matchSetup?.tossDecision,
      homePlayingXI: setupDto.homePlayingXI || match.matchSetup?.homePlayingXI || [],
      awayPlayingXI: setupDto.awayPlayingXI || match.matchSetup?.awayPlayingXI || [],
    };

    // Determine batting team - use toss if available, otherwise default to home
    let battingTeam: 'home' | 'away' = 'home';
    if (match.matchSetup.tossDecision && match.matchSetup.tossWinner) {
      battingTeam = match.matchSetup.tossDecision === 'bat' 
        ? match.matchSetup.tossWinner 
        : match.matchSetup.tossWinner === 'home' ? 'away' : 'home';
    }

    // Initialize live state (use provided values or defaults)
    match.liveState = {
      currentInnings: 1,
      battingTeam,
      strikerId: setupDto.openingBatter1Id || match.liveState?.strikerId || '',
      nonStrikerId: setupDto.openingBatter2Id || match.liveState?.nonStrikerId || '',
      bowlerId: setupDto.firstBowlerId || match.liveState?.bowlerId || '',
      currentOver: match.liveState?.currentOver || 0,
      currentBall: match.liveState?.currentBall || 0,
      isInningsBreak: false,
    };

    // Initialize batting and bowling stats
    match.battingStats = [];
    match.bowlingStats = [];

    // Allow match to go live even with minimal setup - scorer can update details later
    // Only change to live if currently upcoming (don't change if already live)
    if (match.status === 'upcoming') {
      match.status = 'live';
    }
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

    // Calculate runs to add
    // Wide/No-ball: The runs value includes base 1 + additional runs (e.g., wide 4 = 5 total runs)
    // Normal/Bye/Leg-bye: Use the run value as-is
    let runsToAdd = ballDto.delivery.runs;

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
      // Normal delivery (normal, bye, leg_bye) - check for strike rotation
      // Bye and leg_bye: strike rotates on odd runs even though runs don't count to batter
      if (ballDto.delivery.runs % 2 === 1) {
        // Odd runs - swap strike
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
    }
    // Wide and no-ball: No strike rotation

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

    // Calculate current run rate
    const teamTotalOvers = match.currentScore[battingTeam].overs + (match.currentScore[battingTeam].balls / 6);
    match.liveState.currentRunRate = teamTotalOvers > 0 
      ? (match.currentScore[battingTeam].runs / teamTotalOvers) 
      : 0;

    // Calculate partnership (will be updated after batting stats are updated below)

    // Calculate required run rate for chases (second innings)
    if (ballDto.innings === 2) {
      // Get first innings total
      const firstInningsBattingTeam = battingTeam === 'home' ? 'away' : 'home';
      const firstInningsTotal = match.currentScore[firstInningsBattingTeam]?.runs || 0;
      match.liveState.target = firstInningsTotal + 1; // Target is first innings total + 1

      const currentRuns = match.currentScore[battingTeam].runs;
      const runsNeeded = Math.max(0, match.liveState.target - currentRuns);
      const maxOvers = match.format?.toLowerCase().includes('t20') ? 20 : 
                      match.format?.toLowerCase().includes('odi') ? 50 : undefined;
      
      if (maxOvers) {
        const oversRemaining = maxOvers - teamTotalOvers;
        match.liveState.requiredRunRate = oversRemaining > 0 
          ? (runsNeeded / oversRemaining) 
          : 0;
      }
    } else {
      // First innings - no required rate
      match.liveState.requiredRunRate = undefined;
      match.liveState.target = undefined;
    }

    // Update batting stats
    if (!match.battingStats) {
      match.battingStats = [];
    }

    // Update striker stats
    let strikerStats = match.battingStats.find(
      (s) => s.playerId === ballDto.strikerId && s.innings === ballDto.innings && s.team === battingTeam,
    );
    if (!strikerStats) {
      strikerStats = {
        innings: ballDto.innings,
        team: battingTeam,
        playerId: ballDto.strikerId,
        playerName: '', // TODO: Get from match setup
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        isOut: false,
      };
      match.battingStats.push(strikerStats);
    }

    // Update striker stats for legal deliveries (normal, bye, leg_bye)
    // Wides and no-balls don't count as balls faced by batter
    if (ballDto.delivery.ballType === 'normal' || ballDto.delivery.ballType === 'bye' || ballDto.delivery.ballType === 'leg_bye') {
      // For bye and leg_bye, runs don't count to batter
      if (ballDto.delivery.ballType === 'normal') {
        strikerStats.runs += ballDto.delivery.runs;
      }
      strikerStats.balls += 1;
      
      // Auto-detect boundaries
      if (ballDto.delivery.isSix || ballDto.delivery.runs === 6) {
        strikerStats.sixes += 1;
        if (ballDto.delivery.ballType === 'normal') {
          strikerStats.runs += 6; // Already added above, but ensure it's counted
        }
      } else if (ballDto.delivery.isBoundary || ballDto.delivery.runs === 4) {
        strikerStats.fours += 1;
      }
      
      strikerStats.strikeRate = strikerStats.balls > 0 ? (strikerStats.runs / strikerStats.balls) * 100 : 0;
    }

    if (ballDto.delivery.isWicket && ballDto.delivery.dismissedBatterId === ballDto.strikerId) {
      strikerStats.isOut = true;
      strikerStats.dismissalType = ballDto.delivery.dismissalType;
      strikerStats.dismissedBy = ballDto.bowlerId;
      strikerStats.fielderId = ballDto.delivery.fielderId;
      strikerStats.fowScore = match.currentScore[battingTeam].runs;
      strikerStats.fowBalls = match.currentScore[battingTeam].overs * 6 + match.currentScore[battingTeam].balls;
    }

    // Update non-striker stats (for partnership calculation)
    let nonStrikerStats = match.battingStats.find(
      (s) => s.playerId === ballDto.nonStrikerId && s.innings === ballDto.innings && s.team === battingTeam,
    );
    if (!nonStrikerStats) {
      nonStrikerStats = {
        innings: ballDto.innings,
        team: battingTeam,
        playerId: ballDto.nonStrikerId,
        playerName: '',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        isOut: false,
      };
      match.battingStats.push(nonStrikerStats);
    }

    // Calculate partnership from updated stats
    // Partnership runs = sum of both current batters' runs in this innings
    match.liveState.partnershipRuns = (strikerStats.runs || 0) + (nonStrikerStats.runs || 0);
    // Partnership balls = total balls faced by both batters
    match.liveState.partnershipBalls = (strikerStats.balls || 0) + (nonStrikerStats.balls || 0);

    // Update bowling stats
    if (!match.bowlingStats) {
      match.bowlingStats = [];
    }

    let bowlerStats = match.bowlingStats.find(
      (s) => s.playerId === ballDto.bowlerId && s.innings === ballDto.innings && s.team === bowlingTeam,
    );
    if (!bowlerStats) {
      bowlerStats = {
        innings: ballDto.innings,
        team: bowlingTeam,
        playerId: ballDto.bowlerId,
        playerName: '', // TODO: Get from match setup
        overs: 0,
        balls: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0,
        wides: 0,
        noBalls: 0,
      };
      match.bowlingStats.push(bowlerStats);
    }

    bowlerStats.runs += runsToAdd;
    if (ballDto.delivery.ballType === 'wide') {
      bowlerStats.wides += 1;
    } else if (ballDto.delivery.ballType === 'no_ball') {
      bowlerStats.noBalls += 1;
    } else {
      // Normal delivery - increment balls, then calculate overs
      bowlerStats.balls = (bowlerStats.balls || 0) + 1;
      if (bowlerStats.balls >= 6) {
        bowlerStats.overs += 1;
        bowlerStats.balls = 0;
      }
    }

    if (ballDto.delivery.isWicket && ballDto.delivery.bowlerId === ballDto.bowlerId) {
      bowlerStats.wickets += 1;
    }

    // Calculate economy rate
    const totalOvers = bowlerStats.overs + ((bowlerStats.balls || 0) / 6);
    bowlerStats.economy = totalOvers > 0 ? (bowlerStats.runs / totalOvers) : 0;

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
   * Start second innings
   */
  async startSecondInnings(
    matchId: string,
    openingBatter1Id: string,
    openingBatter2Id: string,
    firstBowlerId: string,
    scorerId: string,
  ): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only manage matches you created');
    }

    if (!match.liveState || match.liveState.currentInnings !== 1) {
      throw new BadRequestException('Second innings can only be started after first innings');
    }

    // Determine second innings batting team (opposite of first innings)
    const firstInningsBattingTeam = match.liveState.battingTeam || 'home';
    const secondInningsBattingTeam = firstInningsBattingTeam === 'home' ? 'away' : 'home';

    // Update live state for second innings
    match.liveState.currentInnings = 2;
    match.liveState.battingTeam = secondInningsBattingTeam;
    match.liveState.strikerId = openingBatter1Id;
    match.liveState.nonStrikerId = openingBatter2Id;
    match.liveState.bowlerId = firstBowlerId;
    match.liveState.currentOver = 0;
    match.liveState.currentBall = 0;
    match.liveState.isInningsBreak = false;

    match.scorerInfo.lastUpdate = new Date();
    await match.save();

    return match.toObject();
  }

  /**
   * Complete and lock a match
   */
  async completeMatch(
    matchId: string,
    scorerId: string,
    matchResult?: {
      winner?: 'home' | 'away' | 'tie' | 'no_result';
      margin?: string;
      keyPerformers?: Array<{ playerId: string; playerName: string; role: string; performance: string }>;
      notes?: string;
    },
  ): Promise<LocalMatch> {
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
    match.isLocked = true;

    if (matchResult) {
      match.matchResult = {
        winner: matchResult.winner,
        margin: matchResult.margin,
        keyPerformers: matchResult.keyPerformers || [],
        notes: matchResult.notes,
      };
    }

    match.scorerInfo.lastUpdate = new Date();
    await match.save();

    return match.toObject();
  }

  /**
   * Update live state (current players, over, ball)
   */
  async updateLiveState(
    matchId: string,
    updateDto: { strikerId?: string; nonStrikerId?: string; bowlerId?: string; currentOver?: number; currentBall?: number },
    scorerId: string,
  ): Promise<LocalMatch> {
    const match = await this.localMatchModel.findOne({ matchId });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    if (match.scorerInfo.scorerId !== scorerId) {
      throw new ForbiddenException('You can only update matches you created');
    }

    if (match.isLocked) {
      throw new BadRequestException('Match is locked and cannot be edited');
    }

    if (!match.liveState) {
      throw new BadRequestException('Match setup must be completed before updating live state');
    }

    // Update live state fields
    if (updateDto.strikerId !== undefined) {
      match.liveState.strikerId = updateDto.strikerId;
    }
    if (updateDto.nonStrikerId !== undefined) {
      match.liveState.nonStrikerId = updateDto.nonStrikerId;
    }
    if (updateDto.bowlerId !== undefined) {
      match.liveState.bowlerId = updateDto.bowlerId;
    }
    if (updateDto.currentOver !== undefined) {
      match.liveState.currentOver = updateDto.currentOver;
    }
    if (updateDto.currentBall !== undefined) {
      if (updateDto.currentBall < 0 || updateDto.currentBall > 5) {
        throw new BadRequestException('Ball number must be between 0 and 5');
      }
      match.liveState.currentBall = updateDto.currentBall;
    }

    match.scorerInfo.lastUpdate = new Date();
    await match.save();
    return match.toObject();
  }
}

