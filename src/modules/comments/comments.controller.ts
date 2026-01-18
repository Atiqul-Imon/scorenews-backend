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
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get comments for a thread or article' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  async getComments(@Query() filters: any) {
    return this.commentsService.getComments(filters);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiResponse({ status: 200, description: 'Comment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async getCommentById(@Param('id') id: string) {
    return this.commentsService.getCommentById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  async createComment(@Body() data: any, @CurrentUser() user: any) {
    return this.commentsService.createComment(data, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a comment' })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  async updateComment(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
    return this.commentsService.updateComment(id, data, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a comment' })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully' })
  async deleteComment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.deleteComment(id, user.id || user._id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/upvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvote a comment' })
  @ApiResponse({ status: 200, description: 'Comment upvoted successfully' })
  async upvoteComment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.upvoteComment(id, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/downvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Downvote a comment' })
  @ApiResponse({ status: 200, description: 'Comment downvoted successfully' })
  async downvoteComment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.downvoteComment(id, user.id || user._id);
  }
}
