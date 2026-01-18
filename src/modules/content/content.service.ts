import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Content, ContentDocument } from './schemas/content.schema';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private contentModel: Model<ContentDocument>,
    private elasticsearchService: ElasticsearchService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
    private usersService: UsersService,
  ) {}

  async getContent(filters: any) {
    const { page = 1, limit = 20, type, category, status = 'approved', featured } = filters;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (featured === 'true') filter.featured = true;

    const cacheKey = `content:${JSON.stringify(filter)}:${page}:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const content = await this.contentModel
      .find(filter)
      .populate('contributor', 'name email avatar')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.contentModel.countDocuments(filter);

    const result = {
      content,
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

  async getContentById(id: string) {
    const cachedData = await this.redisService.get(`content:${id}`);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const content = await this.contentModel
      .findById(id)
      .populate('contributor', 'name email avatar stats')
      .lean();

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    // Increment views
    await this.contentModel.findByIdAndUpdate(id, { $inc: { views: 1 } });

    await this.redisService.set(`content:${id}`, JSON.stringify(content), 60);
    return content;
  }

  async createContent(data: any, contributorId: string) {
    const { title, content, type, category, tags, mediaUrl, thumbnailUrl, duration } = data;

    const newContent = await this.contentModel.create({
      title,
      content,
      type,
      contributor: contributorId,
      category,
      tags: tags || [],
      mediaUrl,
      thumbnailUrl,
      duration,
      status: 'pending',
    });

    // Update user stats
    await this.usersService.incrementContentSubmitted(contributorId);

    // Index in Elasticsearch
    try {
      await this.elasticsearchService.indexDocument('content', newContent._id.toString(), {
        title: newContent.title,
        content: newContent.content,
        type: newContent.type,
        category: newContent.category,
        tags: newContent.tags,
        status: newContent.status,
        publishedAt: newContent.publishedAt,
        createdAt: (newContent as any).createdAt,
      });
    } catch (error) {
      this.logger.error('Error indexing content in Elasticsearch', error.stack, 'ContentService');
    }

    return newContent;
  }

  async updateContent(id: string, data: any, userId: string, userRole: string) {
    const existingContent = await this.contentModel.findById(id);

    if (!existingContent) {
      throw new NotFoundException('Content not found');
    }

    // Check if user owns the content or is admin/moderator
    if (existingContent.contributor.toString() !== userId && !['admin', 'moderator'].includes(userRole)) {
      throw new ForbiddenException('You can only update your own content');
    }

    const updatedContent = await this.contentModel.findByIdAndUpdate(
      id,
      {
        title: data.title || existingContent.title,
        content: data.content || existingContent.content,
        tags: data.tags || existingContent.tags,
        mediaUrl: data.mediaUrl || existingContent.mediaUrl,
        thumbnailUrl: data.thumbnailUrl || existingContent.thumbnailUrl,
        duration: data.duration || existingContent.duration,
        status: 'pending', // Reset to pending when updated
      },
      { new: true },
    ).populate('contributor', 'name email avatar');

    await this.redisService.del(`content:${id}`);
    return updatedContent;
  }

  async deleteContent(id: string, userId: string, userRole: string) {
    const content = await this.contentModel.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    // Check if user owns the content or is admin
    if (content.contributor.toString() !== userId && userRole !== 'admin') {
      throw new ForbiddenException('You can only delete your own content');
    }

    await this.contentModel.findByIdAndDelete(id);

    // Update user stats
    await this.usersService.decrementContentSubmitted(content.contributor.toString());

    // Remove from Elasticsearch
    try {
      await this.elasticsearchService.deleteDocument('content', id);
    } catch (error) {
      this.logger.error('Error removing content from Elasticsearch', error.stack, 'ContentService');
    }

    await this.redisService.del(`content:${id}`);
    return { message: 'Content deleted successfully' };
  }

  async approveContent(id: string) {
    const content = await this.contentModel.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    const updatedContent = await this.contentModel.findByIdAndUpdate(
      id,
      {
        status: 'approved',
        publishedAt: new Date(),
      },
      { new: true },
    ).populate('contributor', 'name email avatar');

    // Update user stats
    await this.usersService.incrementContentApproved(content.contributor.toString());

    await this.redisService.del(`content:${id}`);
    return updatedContent;
  }

  async rejectContent(id: string, reason?: string) {
    const content = await this.contentModel.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    const updatedContent = await this.contentModel.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        rejectionReason: reason,
      },
      { new: true },
    ).populate('contributor', 'name email avatar');

    await this.redisService.del(`content:${id}`);
    return updatedContent;
  }

  async getFeaturedContent(limit: number = 10) {
    const cacheKey = `featured_content:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const content = await this.contentModel
      .find({
        featured: true,
        status: 'approved',
      })
      .populate('contributor', 'name email avatar')
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    await this.redisService.set(cacheKey, JSON.stringify(content), 3600);
    return content;
  }

  async searchContent(query: string, filters: any = {}, page: number = 1, limit: number = 20) {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    const skip = (page - 1) * limit;

    try {
      const results = await this.elasticsearchService.searchContent(query, filters, limit, skip);

      return {
        content: results.hits,
        pagination: {
          current: page,
          pages: Math.ceil(results.total / limit),
          total: results.total,
          limit,
        },
        took: results.took,
      };
    } catch (error) {
      this.logger.error('Error searching content', error.stack, 'ContentService');

      // Fallback to database search
      const filter: any = {
        $text: { $search: query },
        status: 'approved',
        ...filters,
      };

      const content = await this.contentModel
        .find(filter)
        .populate('contributor', 'name email avatar')
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await this.contentModel.countDocuments(filter);

      return {
        content,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      };
    }
  }

  async likeContent(id: string, userId: string) {
    const content = await this.contentModel.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    // Check if user already liked (would need a separate likes collection in production)
    await this.contentModel.findByIdAndUpdate(id, {
      $inc: { likes: 1 },
    });

    return { message: 'Content liked successfully' };
  }

  async addComment(id: string, userId: string, commentContent: string) {
    const content = await this.contentModel.findById(id);

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    const comment = {
      user: userId,
      content: commentContent,
      createdAt: new Date(),
      likes: 0,
    };

    await this.contentModel.findByIdAndUpdate(id, {
      $push: { comments: comment },
    });

    await this.redisService.del(`content:${id}`);
    return comment;
  }
}
