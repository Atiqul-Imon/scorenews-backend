import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CricketService } from './cricket.service';
import { GetMatchesDto } from './dto/get-matches.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('cricket')
@Controller('cricket')
export class CricketController {
  constructor(private readonly cricketService: CricketService) {}

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
    const matches = await this.cricketService.getLiveMatches();
    // Return as array for frontend compatibility
    return Array.isArray(matches) ? matches : [];
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
  @ApiOperation({ summary: 'Get cricket match commentary' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Commentary retrieved successfully' })
  async getCommentary(@Param('id') id: string) {
    return this.cricketService.getCommentary(id);
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
}
