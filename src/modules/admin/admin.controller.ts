import { Controller, Get, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats retrieved successfully' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('content/pending')
  @ApiOperation({ summary: 'Get pending content for moderation' })
  @ApiResponse({ status: 200, description: 'Pending content retrieved successfully' })
  async getPendingContent(@Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.adminService.getPendingContent(page, limit);
  }

  @Get('news/pending')
  @ApiOperation({ summary: 'Get pending news for moderation' })
  @ApiResponse({ status: 200, description: 'Pending news retrieved successfully' })
  async getPendingNews(@Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.adminService.getPendingNews(page, limit);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('role') role?: string,
  ) {
    return this.adminService.getAllUsers(page, limit, role);
  }

  @Put('users/:id/role')
  @ApiOperation({ summary: 'Update user role' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  async updateUserRole(@Param('id') userId: string, @Body('role') role: string) {
    return this.adminService.updateUserRole(userId, role);
  }

  // Scorer Management Endpoints
  @Get('scorers/stats')
  @ApiOperation({ summary: 'Get scorer statistics and analytics' })
  @ApiResponse({ status: 200, description: 'Scorer stats retrieved successfully' })
  async getScorerStats() {
    return this.adminService.getScorerStats();
  }

  @Get('scorers')
  @ApiOperation({ summary: 'Get all scorers with filters' })
  @ApiResponse({ status: 200, description: 'Scorers retrieved successfully' })
  async getAllScorers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('scorerType') scorerType?: string,
    @Query('city') city?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllScorers(page, limit, {
      verificationStatus,
      scorerType,
      city,
      search,
    });
  }

  @Get('scorers/:id')
  @ApiOperation({ summary: 'Get scorer details by ID' })
  @ApiResponse({ status: 200, description: 'Scorer details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Scorer not found' })
  async getScorerById(@Param('id') scorerId: string) {
    return this.adminService.getScorerById(scorerId);
  }

  @Put('scorers/:id/verification')
  @ApiOperation({ summary: 'Update scorer verification status' })
  @ApiResponse({ status: 200, description: 'Verification status updated successfully' })
  @ApiResponse({ status: 404, description: 'Scorer not found' })
  async updateScorerVerification(
    @Param('id') scorerId: string,
    @Body('verificationStatus') verificationStatus: 'verified' | 'pending' | 'suspended',
  ) {
    return this.adminService.updateScorerVerification(scorerId, verificationStatus);
  }

  @Get('scorers/:id/matches')
  @ApiOperation({ summary: 'Get matches created by a scorer' })
  @ApiResponse({ status: 200, description: 'Scorer matches retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Scorer not found' })
  async getScorerMatches(
    @Param('id') scorerId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getScorerMatches(scorerId, page, limit, {
      status,
      startDate,
      endDate,
    });
  }
}
