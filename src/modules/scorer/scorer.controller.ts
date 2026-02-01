import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ScorerService } from './scorer.service';
import { ScorerRegistrationDto } from './dto/scorer-registration.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@ApiTags('scorer')
@Controller('scorer')
export class ScorerController {
  constructor(private readonly scorerService: ScorerService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register as a scorer' })
  @ApiResponse({ status: 201, description: 'Scorer registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or terms not accepted' })
  @ApiResponse({ status: 409, description: 'Phone or email already registered' })
  async register(@Body() registerDto: ScorerRegistrationDto) {
    return this.scorerService.registerScorer(registerDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get scorer profile' })
  @ApiResponse({ status: 200, description: 'Scorer profile retrieved successfully' })
  @ApiResponse({ status: 400, description: 'User is not a registered scorer' })
  async getProfile(@CurrentUser() user: UserDocument) {
    return this.scorerService.getScorerProfile(user._id.toString());
  }

  @Get('matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get scorer matches' })
  @ApiQuery({ name: 'status', required: false, enum: ['upcoming', 'live', 'completed'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Scorer matches retrieved successfully' })
  async getMatches(
    @CurrentUser() user: UserDocument,
    @Query('status') status?: 'upcoming' | 'live' | 'completed',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.scorerService.getScorerMatches(user._id.toString(), {
      status,
      page: page ? parseInt(page.toString()) : undefined,
      limit: limit ? parseInt(limit.toString()) : undefined,
      startDate,
      endDate,
    });
  }
}







