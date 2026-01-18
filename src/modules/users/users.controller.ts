import { Controller, Get, Put, Delete, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all users (admin/moderator)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(@Query() query: any, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      data: await this.usersService.findAll(query),
    };
  }

  @Public()
  @Get('top-contributors')
  @ApiOperation({ summary: 'Get top contributors' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top contributors list' })
  async getTopContributors(@Query('limit') limit?: string) {
    return {
      success: true,
      data: await this.usersService.getTopContributors(limit ? Number(limit) : 10),
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    return {
      success: true,
      data: await this.usersService.getUserById(id),
    };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: UserDocument,
  ) {
    return {
      success: true,
      data: await this.usersService.updateUser(id, updateUserDto, user._id.toString(), user.role),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      ...(await this.usersService.deleteUser(id, user._id.toString(), user.role)),
    };
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user statistics' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User statistics' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserStats(@Param('id') id: string) {
    return {
      success: true,
      data: await this.usersService.getUserStats(id),
    };
  }

  @Public()
  @Get(':id/content')
  @ApiOperation({ summary: 'Get user content' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiResponse({ status: 200, description: 'User content list' })
  async getUserContent(@Param('id') id: string, @Query() query: any) {
    return {
      success: true,
      data: await this.usersService.getUserContent(id, query),
    };
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Follow user' })
  @ApiParam({ name: 'id', description: 'User ID to follow' })
  @ApiResponse({ status: 200, description: 'User followed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async followUser(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      ...(await this.usersService.followUser(id, user._id.toString())),
    };
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unfollow user' })
  @ApiParam({ name: 'id', description: 'User ID to unfollow' })
  @ApiResponse({ status: 200, description: 'User unfollowed successfully' })
  async unfollowUser(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      ...(await this.usersService.unfollowUser(id, user._id.toString())),
    };
  }

  @Public()
  @Get(':id/followers')
  @ApiOperation({ summary: 'Get user followers' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Followers list' })
  async getFollowers(@Param('id') id: string, @Query() query: any) {
    return {
      success: true,
      data: await this.usersService.getFollowers(id, query),
    };
  }

  @Public()
  @Get(':id/following')
  @ApiOperation({ summary: 'Get users that a user is following' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Following list' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getFollowing(@Param('id') id: string, @Query() query: any) {
    return {
      success: true,
      data: await this.usersService.getFollowing(id, query),
    };
  }

  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updatePreferences(@Body() updatePreferencesDto: UpdatePreferencesDto, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      data: await this.usersService.updatePreferences(user._id.toString(), updatePreferencesDto),
    };
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Notifications list' })
  async getNotifications(@Query() query: any, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      data: await this.usersService.getNotifications(user._id.toString(), query),
    };
  }

  @Patch('notifications/:id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markNotificationAsRead(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      ...(await this.usersService.markNotificationAsRead(id, user._id.toString())),
    };
  }

  @Delete('notifications/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  async deleteNotification(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return {
      success: true,
      ...(await this.usersService.deleteNotification(id, user._id.toString())),
    };
  }

  // Admin-only routes (for API compatibility with Express backend)
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of users' })
  async adminGetAllUsers(@Query() query: any) {
    return {
      success: true,
      data: await this.usersService.findAll(query),
    };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async adminDeleteUser(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    // Admin can delete any user
    return {
      success: true,
      ...(await this.usersService.deleteUser(id, user._id.toString(), user.role)),
    };
  }
}



