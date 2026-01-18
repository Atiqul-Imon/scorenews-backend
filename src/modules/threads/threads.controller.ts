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
import { ThreadsService } from './threads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('threads')
@Controller('threads')
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all threads with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Threads retrieved successfully' })
  async getThreads(@Query() filters: any) {
    return this.threadsService.getThreads(filters);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get thread by ID' })
  @ApiResponse({ status: 200, description: 'Thread retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async getThreadById(@Param('id') id: string) {
    return this.threadsService.getThreadById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new thread' })
  @ApiResponse({ status: 201, description: 'Thread created successfully' })
  async createThread(@Body() data: any, @CurrentUser() user: any) {
    return this.threadsService.createThread(data, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a thread' })
  @ApiResponse({ status: 200, description: 'Thread updated successfully' })
  async updateThread(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
    return this.threadsService.updateThread(id, data, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a thread' })
  @ApiResponse({ status: 200, description: 'Thread deleted successfully' })
  async deleteThread(@Param('id') id: string, @CurrentUser() user: any) {
    return this.threadsService.deleteThread(id, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/upvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvote a thread' })
  @ApiResponse({ status: 200, description: 'Thread upvoted successfully' })
  async upvoteThread(@Param('id') id: string, @CurrentUser() user: any) {
    return this.threadsService.upvoteThread(id, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/downvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Downvote a thread' })
  @ApiResponse({ status: 200, description: 'Thread downvoted successfully' })
  async downvoteThread(@Param('id') id: string, @CurrentUser() user: any) {
    return this.threadsService.downvoteThread(id, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @Post(':id/pin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin/unpin a thread (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Thread pin status updated successfully' })
  async pinThread(@Param('id') id: string) {
    return this.threadsService.pinThread(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @Post(':id/lock')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lock/unlock a thread (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Thread lock status updated successfully' })
  async lockThread(@Param('id') id: string) {
    return this.threadsService.lockThread(id);
  }
}
