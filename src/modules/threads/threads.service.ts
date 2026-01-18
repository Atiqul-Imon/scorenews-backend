import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Thread, ThreadDocument } from './schemas/thread.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

@Injectable()
export class ThreadsService {
  constructor(
    @InjectModel(Thread.name) private threadModel: Model<ThreadDocument>,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {}

  async getThreads(filters: any) {
    const {
      page = 1,
      limit = 20,
      category,
      sort = 'hot',
      time = 'all',
      search,
      tags,
      author,
    } = filters;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (category) filter.category = category;
    if (author) filter.author = author;
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { content: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') },
      ];
    }

    // Time filter
    if (time !== 'all') {
      const timeMap: { [key: string]: number } = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
      };

      if (timeMap[time]) {
        filter.createdAt = {
          $gte: new Date(Date.now() - timeMap[time]),
        };
      }
    }

    // Build sort object
    let sortObj: any = {};
    switch (sort) {
      case 'hot':
        sortObj = { isPinned: -1, score: -1, lastActivity: -1 };
        break;
      case 'new':
        sortObj = { isPinned: -1, createdAt: -1 };
        break;
      case 'top':
        sortObj = { isPinned: -1, score: -1, createdAt: -1 };
        break;
      case 'controversial':
        sortObj = { isPinned: -1, upvotes: -1, downvotes: -1 };
        break;
      default:
        sortObj = { isPinned: -1, score: -1, lastActivity: -1 };
    }

    const cacheKey = `threads:${JSON.stringify(filter)}:${sort}:${time}:${page}:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const threads = await this.threadModel
      .find(filter)
      .populate('author', 'name avatar stats')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.threadModel.countDocuments(filter);

    const result = {
      threads,
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

  async getThreadById(id: string) {
    // Increment view count
    await this.threadModel.findByIdAndUpdate(id, { $inc: { views: 1 } });

    const thread = await this.threadModel.findById(id).populate('author', 'name avatar stats').lean();

    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Thread not found');
    }

    return thread;
  }

  async createThread(data: any, authorId: string) {
    const { title, content, category, tags, flair, media, poll } = data;

    if (!title || !content || !category) {
      throw new BadRequestException('Title, content, and category are required');
    }

    const thread = await this.threadModel.create({
      title,
      content,
      author: authorId,
      category,
      tags: tags || [],
      flair,
      media,
      poll,
    });

    return thread;
  }

  async updateThread(id: string, data: any, userId: string, userRole: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Thread not found');
    }

    // Check if user owns the thread or is admin/moderator
    if (thread.author.toString() !== userId && !['admin', 'moderator'].includes(userRole)) {
      throw new ForbiddenException('You can only update your own threads');
    }

    const updatedThread = await this.threadModel.findByIdAndUpdate(
      id,
      {
        ...data,
        editedAt: new Date(),
        editedBy: userId,
      },
      { new: true },
    ).populate('author', 'name avatar stats');

    await this.redisService.del(`thread:${id}`);
    return updatedThread;
  }

  async deleteThread(id: string, userId: string, userRole: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Thread not found');
    }

    // Check if user owns the thread or is admin/moderator
    if (thread.author.toString() !== userId && !['admin', 'moderator'].includes(userRole)) {
      throw new ForbiddenException('You can only delete your own threads');
    }

    await this.threadModel.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: userId,
    });

    return { message: 'Thread deleted successfully' };
  }

  async upvoteThread(id: string, userId: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Thread not found');
    }

    // In production, use a separate Vote model to track user votes
    await this.threadModel.findByIdAndUpdate(id, {
      $inc: { upvotes: 1, score: 1 },
    });

    return { message: 'Thread upvoted successfully' };
  }

  async downvoteThread(id: string, userId: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Thread not found');
    }

    await this.threadModel.findByIdAndUpdate(id, {
      $inc: { downvotes: 1, score: -1 },
    });

    return { message: 'Thread downvoted successfully' };
  }

  async pinThread(id: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.threadModel.findByIdAndUpdate(id, {
      isPinned: !thread.isPinned,
    });

    return { message: `Thread ${thread.isPinned ? 'unpinned' : 'pinned'} successfully` };
  }

  async lockThread(id: string) {
    const thread = await this.threadModel.findById(id);

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.threadModel.findByIdAndUpdate(id, {
      isLocked: !thread.isLocked,
    });

    return { message: `Thread ${thread.isLocked ? 'unlocked' : 'locked'} successfully` };
  }
}
