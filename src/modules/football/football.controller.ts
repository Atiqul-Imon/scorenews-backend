import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FootballService } from './football.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('football')
@Controller('football')
export class FootballController {
  constructor(private readonly footballService: FootballService) {}

  @Public()
  @Get('matches/live')
  @ApiOperation({ summary: 'Get live football matches' })
  @ApiResponse({ status: 200, description: 'Live matches retrieved successfully' })
  async getLiveMatches() {
    return this.footballService.getLiveMatches();
  }

  @Public()
  @Get('matches/fixtures')
  @ApiOperation({ summary: 'Get upcoming football fixtures' })
  @ApiResponse({ status: 200, description: 'Fixtures retrieved successfully' })
  async getFixtures(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('league') league?: string,
    @Query('season') season?: string,
  ) {
    return this.footballService.getFixtures(page, limit, league, season);
  }

  @Public()
  @Get('matches/results')
  @ApiOperation({ summary: 'Get completed football matches' })
  @ApiResponse({ status: 200, description: 'Results retrieved successfully' })
  async getResults(@Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.footballService.getResults(page, limit);
  }

  @Public()
  @Get('matches/:id')
  @ApiOperation({ summary: 'Get football match by ID' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatchById(@Param('id') id: string) {
    return this.footballService.getMatchById(id);
  }
}
