import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all content with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Content retrieved successfully' })
  async getContent(@Query() filters: any) {
    return this.contentService.getContent(filters);
  }

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Get featured content' })
  @ApiResponse({ status: 200, description: 'Featured content retrieved successfully' })
  async getFeaturedContent(@Query('limit') limit: number = 10) {
    return this.contentService.getFeaturedContent(limit);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search content' })
  @ApiResponse({ status: 200, description: 'Search results retrieved successfully' })
  async searchContent(
    @Query('q') query: string,
    @Query() filters: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.contentService.searchContent(query, filters, page, limit);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  @ApiResponse({ status: 200, description: 'Content retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async getContentById(@Param('id') id: string) {
    return this.contentService.getContentById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new content' })
  @ApiResponse({ status: 201, description: 'Content created successfully' })
  async createContent(@Body() data: any, @CurrentUser() user: any) {
    return this.contentService.createContent(data, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update content' })
  @ApiResponse({ status: 200, description: 'Content updated successfully' })
  async updateContent(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser() user: any,
  ) {
    return this.contentService.updateContent(id, data, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete content' })
  @ApiResponse({ status: 200, description: 'Content deleted successfully' })
  async deleteContent(@Param('id') id: string, @CurrentUser() user: any) {
    return this.contentService.deleteContent(id, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @Put(':id/approve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve content (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Content approved successfully' })
  async approveContent(@Param('id') id: string) {
    return this.contentService.approveContent(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @Put(':id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject content (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Content rejected successfully' })
  async rejectContent(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.contentService.rejectContent(id, reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like content' })
  @ApiResponse({ status: 200, description: 'Content liked successfully' })
  async likeContent(@Param('id') id: string, @CurrentUser() user: any) {
    return this.contentService.likeContent(id, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add comment to content' })
  @ApiResponse({ status: 200, description: 'Comment added successfully' })
  async addComment(
    @Param('id') id: string,
    @Body('content') commentContent: string,
    @CurrentUser() user: any,
  ) {
    return this.contentService.addComment(id, user.id || user._id, commentContent);
  }
}
