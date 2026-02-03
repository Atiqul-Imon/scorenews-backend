import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, BadRequestException, ForbiddenException, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CricketService } from './cricket.service';
import { GetMatchesDto } from './dto/get-matches.dto';
import { LocalMatchService } from './services/local-match.service';
import { CreateLocalMatchDto } from './dto/create-local-match.dto';
import { UpdateLocalMatchScoreDto } from './dto/update-local-match-score.dto';
import { RecordBallDto } from './dto/record-ball.dto';
import { MatchSetupDto } from './dto/match-setup.dto';
import { UpdateLiveStateDto } from './dto/update-live-state.dto';
import { AddCommentaryDto } from './dto/add-commentary.dto';
import { CommentaryService } from './services/commentary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@ApiTags('cricket')
@Controller('cricket')
export class CricketController {
  private readonly logger = new Logger(CricketController.name);

  constructor(
    private readonly cricketService: CricketService,
    private readonly localMatchService: LocalMatchService,
    private readonly commentaryService: CommentaryService,
  ) {}

  @Public()
  @Get('matches')
  @ApiOperation({ summary: 'Get all cricket matches with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Matches retrieved successfully' })
  async getMatches(@Query() filters: GetMatchesDto) {
    return this.cricketService.getMatches(filters);
  }

  @Public()
  @Get('matches/live')
  @ApiOperation({ summary: 'Get live cricket matches' })
  @ApiResponse({ status: 200, description: 'Live matches retrieved successfully' })
  async getLiveMatches() {
    // Always fetch fresh data - no caching
    const result = await this.cricketService.getLiveMatches();
    // Service returns { success: true, data: matches[] }
    return result;
  }

  @Public()
  @Get('matches/fixtures')
  @ApiOperation({ summary: 'Get upcoming cricket fixtures' })
  @ApiResponse({ status: 200, description: 'Fixtures retrieved successfully' })
  async getFixtures(@Query() filters: GetMatchesDto) {
    return this.cricketService.getFixtures(filters);
  }

  @Public()
  @Get('matches/results')
  @ApiOperation({ summary: 'Get completed cricket matches' })
  @ApiResponse({ status: 200, description: 'Results retrieved successfully' })
  async getResults(@Query() filters: GetMatchesDto) {
    return this.cricketService.getResults(filters);
  }

  @Public()
  @Get('matches/:id')
  @ApiOperation({ summary: 'Get cricket match by ID' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatchById(@Param('id') id: string) {
    return this.cricketService.getMatchById(id);
  }

  @Public()
  @Get('matches/:id/commentary')
  @ApiOperation({ summary: 'Get cricket match commentary (merged with in-house commentary)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Commentary retrieved successfully' })
  async getCommentary(@Param('id') id: string, @Query('merge') merge?: string) {
    const shouldMerge = merge !== 'false'; // Default to true
    return this.cricketService.getCommentary(id, shouldMerge);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('matches/:id/commentary/in-house')
  @ApiOperation({ summary: 'Get in-house commentary only (admin/commentator only)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'In-house commentary retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not admin or commentator' })
  async getInHouseCommentary(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Query('innings') innings?: number,
  ) {
    // Check if user is admin or commentator
    if (user.role !== 'admin' && user.role !== 'commentator') {
      throw new ForbiddenException('Only admins and commentators can access in-house commentary');
    }

    const commentary = await this.commentaryService.getInHouseCommentary(id, innings);
    return {
      success: true,
      data: commentary,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('matches/:id/commentary')
  @ApiOperation({ summary: 'Add in-house commentary (admin/commentator only)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 201, description: 'Commentary added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not admin or commentator' })
  async addCommentary(
    @Param('id') id: string,
    @Body() addDto: AddCommentaryDto,
    @CurrentUser() user: UserDocument,
  ) {
    // Check if user is admin or commentator
    if (user.role !== 'admin' && user.role !== 'commentator') {
      throw new ForbiddenException('Only admins and commentators can add commentary');
    }

    const commentary = await this.commentaryService.addCommentary(
      id,
      addDto,
      user._id.toString(),
      user.name,
    );

    return {
      success: true,
      data: commentary,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Put('matches/:id/commentary/:commentaryId')
  @ApiOperation({ summary: 'Update in-house commentary (admin/commentator only)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiParam({ name: 'commentaryId', description: 'Commentary ID' })
  @ApiResponse({ status: 200, description: 'Commentary updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not admin or commentator' })
  async updateCommentary(
    @Param('commentaryId') commentaryId: string,
    @Body() body: { commentary: string },
    @CurrentUser() user: UserDocument,
  ) {
    // Check if user is admin or commentator
    if (user.role !== 'admin' && user.role !== 'commentator') {
      throw new ForbiddenException('Only admins and commentators can update commentary');
    }

    const commentary = await this.commentaryService.updateCommentary(
      commentaryId,
      body.commentary,
      user._id.toString(),
    );

    return {
      success: true,
      data: commentary,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete('matches/:id/commentary/:commentaryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete in-house commentary (admin/commentator only)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiParam({ name: 'commentaryId', description: 'Commentary ID' })
  @ApiResponse({ status: 204, description: 'Commentary deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not admin or commentator' })
  async deleteCommentary(
    @Param('commentaryId') commentaryId: string,
    @CurrentUser() user: UserDocument,
  ) {
    // Check if user is admin or commentator
    if (user.role !== 'admin' && user.role !== 'commentator') {
      throw new ForbiddenException('Only admins and commentators can delete commentary');
    }

    await this.commentaryService.deleteCommentary(
      commentaryId,
      user._id.toString(),
      user.role === 'admin',
    );
  }

  @Public()
  @Get('series')
  @ApiOperation({ summary: 'Get cricket series list' })
  @ApiResponse({ status: 200, description: 'Series retrieved successfully' })
  async getSeries(@Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.cricketService.getSeries(page, limit);
  }

  @Public()
  @Get('players')
  @ApiOperation({ summary: 'Get cricket players' })
  @ApiResponse({ status: 200, description: 'Players retrieved successfully' })
  async getPlayers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('q') query?: string,
  ) {
    return this.cricketService.getPlayers(page, limit, query);
  }

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Get cricket statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats() {
    return this.cricketService.getStats();
  }

  @Public()
  @Get('teams/:teamName/matches')
  @ApiOperation({ summary: 'Get team match statistics' })
  @ApiParam({ name: 'teamName', description: 'Team name' })
  @ApiResponse({ status: 200, description: 'Team match statistics retrieved successfully' })
  async getTeamMatches(@Param('teamName') teamName: string) {
    return this.cricketService.getTeamMatches(teamName);
  }

  // Local Match Endpoints
  @Post('local/matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new local match' })
  @ApiResponse({ status: 201, description: 'Match created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'User is not a registered scorer' })
  async createLocalMatch(
    @Body() createDto: CreateLocalMatchDto,
    @CurrentUser() user: UserDocument,
  ) {
    this.logger.log(`Creating local match for user: ${user.email} (${user._id})`);
    
    // Check if user has scorer profile
    if (!user.scorerProfile) {
      this.logger.warn(`User ${user.email} does not have scorerProfile`);
      throw new ForbiddenException('User is not a registered scorer. Please register as a scorer first.');
    }

    if (!user.scorerProfile.isScorer) {
      this.logger.warn(`User ${user.email} scorerProfile.isScorer is false`);
      throw new ForbiddenException('User is not a registered scorer. Please register as a scorer first.');
    }

    if (!user.scorerProfile.scorerId) {
      this.logger.warn(`User ${user.email} does not have scorerId`);
      throw new ForbiddenException('User scorer profile is incomplete. Please contact support.');
    }

    this.logger.log(`User ${user.email} is a scorer (ID: ${user.scorerProfile.scorerId}, Type: ${user.scorerProfile.scorerType})`);

    try {
      const match = await this.localMatchService.createMatch(
        createDto,
        user.scorerProfile.scorerId,
        user.name,
        user.scorerProfile.scorerType || 'community',
      );

      this.logger.log(`Match created successfully: ${match.matchId} by scorer ${user.scorerProfile.scorerId}`);

      return {
        success: true,
        data: match,
      };
    } catch (error: any) {
      this.logger.error(`Error creating match for user ${user.email}:`, error.stack);
      throw error; // Re-throw to let NestJS handle it
    }
  }

  @Get('local/matches')
  @Public()
  @ApiOperation({ summary: 'Get local matches with filters (only verified matches)' })
  @ApiResponse({ status: 200, description: 'Local matches retrieved successfully' })
  async getLocalMatches(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('area') area?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    // Public endpoint only returns verified matches
    const matches = await this.localMatchService.getLocalMatches(
      {
        city,
        district,
        area,
        status,
        limit: limit ? parseInt(limit.toString()) : undefined,
      },
      false, // includeUnverified = false for public endpoints
    );

    return {
      success: true,
      data: matches,
    };
  }

  @Get('local/matches/:id')
  @Public()
  @ApiOperation({ summary: 'Get local match by ID (only verified matches)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getLocalMatchById(@Param('id') id: string) {
    // Public endpoint only returns verified matches
    const match = await this.localMatchService.getMatchById(id, false);
    return {
      success: true,
      data: match,
    };
  }

  @Put('local/matches/:id/score')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update local match score' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Score updated successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async updateLocalMatchScore(
    @Param('id') id: string,
    @Body() updateDto: UpdateLocalMatchScoreDto,
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new Error('User is not a registered scorer');
    }

    const match = await this.localMatchService.updateScore(
      id,
      updateDto,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Post('local/matches/:id/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete match setup (playing XI, toss, opening batters, first bowler)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match setup completed successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async completeMatchSetup(
    @Param('id') id: string,
    @Body() setupDto: MatchSetupDto,
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    setupDto.matchId = id;
    const match = await this.localMatchService.completeMatchSetup(
      id,
      setupDto,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Post('local/matches/:id/ball')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Record a ball (ball-by-ball scoring)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Ball recorded successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async recordBall(
    @Param('id') id: string,
    @Body() ballDto: RecordBallDto,
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    ballDto.matchId = id;
    const match = await this.localMatchService.recordBall(
      id,
      ballDto,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Post('local/matches/:id/undo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Undo last ball' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Last ball undone successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async undoLastBall(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    const match = await this.localMatchService.undoLastBall(
      id,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Post('local/matches/:id/second-innings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Start second innings' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Second innings started successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async startSecondInnings(
    @Param('id') id: string,
    @Body() body: { openingBatter1Id: string; openingBatter2Id: string; firstBowlerId: string },
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    const match = await this.localMatchService.startSecondInnings(
      id,
      body.openingBatter1Id,
      body.openingBatter2Id,
      body.firstBowlerId,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Post('local/matches/:id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete and lock match' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match completed successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async completeMatch(
    @Param('id') id: string,
    @Body() body: {
      winner?: 'home' | 'away' | 'tie' | 'no_result';
      margin?: string;
      keyPerformers?: Array<{ playerId: string; playerName: string; role: string; performance: string }>;
      notes?: string;
    },
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    const match = await this.localMatchService.completeMatch(
      id,
      user.scorerProfile.scorerId,
      body,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Put('local/matches/:id/live-state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update live state (current players, over, ball)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Live state updated successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async updateLiveState(
    @Param('id') id: string,
    @Body() updateDto: { strikerId?: string; nonStrikerId?: string; bowlerId?: string; currentOver?: number; currentBall?: number },
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    const match = await this.localMatchService.updateLiveState(
      id,
      updateDto,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Put('local/matches/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update match status (upcoming, live, completed, cancelled)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async updateMatchStatus(
    @Param('id') id: string,
    @Body() body: { status: 'upcoming' | 'live' | 'completed' | 'cancelled' },
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    const match = await this.localMatchService.updateMatchStatus(
      id,
      body.status,
      user.scorerProfile.scorerId,
    );

    return {
      success: true,
      data: match,
    };
  }

  @Delete('local/matches/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a match (cannot delete completed matches)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 204, description: 'Match deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete completed matches' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not match owner' })
  async deleteMatch(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    if (!user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new ForbiddenException('User is not a registered scorer');
    }

    await this.localMatchService.deleteMatch(id, user.scorerProfile.scorerId);
  }
}
