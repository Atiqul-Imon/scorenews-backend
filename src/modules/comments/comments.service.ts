import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {}

  async getComments(filters: any) {
    const { threadId, articleId, page = 1, limit = 50, sort = 'top', parentId } = filters;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };

    if (threadId) {
      filter.thread = threadId;
    } else if (articleId) {
      filter.article = articleId;
    } else {
      throw new BadRequestException('Either threadId or articleId must be provided');
    }

    if (parentId) {
      filter.parentComment = parentId;
    } else {
      filter.parentComment = { $exists: false };
    }

    // Build sort object
    let sortObj: any = {};
    switch (sort) {
      case 'top':
        sortObj = { score: -1, createdAt: -1 };
        break;
      case 'new':
        sortObj = { createdAt: -1 };
        break;
      case 'old':
        sortObj = { createdAt: 1 };
        break;
      case 'controversial':
        sortObj = { upvotes: -1, downvotes: -1 };
        break;
      default:
        sortObj = { score: -1, createdAt: -1 };
    }

    const entityId = threadId || articleId;
    const cacheKey = `comments:${entityId}:${parentId || 'root'}:${sort}:${page}:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const comments = await this.commentModel
      .find(filter)
      .populate('author', 'name avatar stats')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.commentModel.countDocuments(filter);

    const result = {
      comments,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  async getCommentById(id: string) {
    const comment = await this.commentModel.findById(id).populate('author', 'name avatar stats').lean();

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  async createComment(data: any, authorId: string) {
    const { content, threadId, articleId, parentCommentId } = data;

    if (!content) {
      throw new BadRequestException('Content is required');
    }

    if (!threadId && !articleId) {
      throw new BadRequestException('Either threadId or articleId must be provided');
    }

    const commentData: any = {
      content,
      author: authorId,
    };

    if (threadId) commentData.thread = threadId;
    if (articleId) commentData.article = articleId;
    if (parentCommentId) commentData.parentComment = parentCommentId;

    const comment = await this.commentModel.create(commentData);

    // Update thread/article comment count if needed
    // This would be handled by the respective services

    return comment;
  }

  async updateComment(id: string, data: any, userId: string, userRole: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    // Check if user owns the comment or is admin/moderator
    if (comment.author.toString() !== userId && !['admin', 'moderator'].includes(userRole)) {
      throw new ForbiddenException('You can only update your own comments');
    }

    const updatedComment = await this.commentModel.findByIdAndUpdate(
      id,
      {
        content: data.content || comment.content,
        editedAt: new Date(),
        editedBy: userId,
        editReason: data.editReason,
      },
      { new: true },
    ).populate('author', 'name avatar stats');

    return updatedComment;
  }

  async deleteComment(id: string, userId: string, userRole: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    // Check if user owns the comment or is admin/moderator
    if (comment.author.toString() !== userId && !['admin', 'moderator'].includes(userRole)) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.commentModel.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: userId,
    });

    return { message: 'Comment deleted successfully' };
  }

  async upvoteComment(id: string, userId: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    await this.commentModel.findByIdAndUpdate(id, {
      $inc: { upvotes: 1, score: 1 },
    });

    return { message: 'Comment upvoted successfully' };
  }

  async downvoteComment(id: string, userId: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    await this.commentModel.findByIdAndUpdate(id, {
      $inc: { downvotes: 1, score: -1 },
    });

    return { message: 'Comment downvoted successfully' };
  }
}
