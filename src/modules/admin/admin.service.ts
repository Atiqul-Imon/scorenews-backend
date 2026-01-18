import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Content, ContentDocument } from '../content/schemas/content.schema';
import { NewsArticle, NewsArticleDocument } from '../news/schemas/news-article.schema';
import { Thread, ThreadDocument } from '../threads/schemas/thread.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Content.name) private contentModel: Model<ContentDocument>,
    @InjectModel(NewsArticle.name) private newsArticleModel: Model<NewsArticleDocument>,
    @InjectModel(Thread.name) private threadModel: Model<ThreadDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    private logger: WinstonLoggerService,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      totalContent,
      totalNews,
      totalThreads,
      totalComments,
      pendingContent,
      pendingNews,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.contentModel.countDocuments(),
      this.newsArticleModel.countDocuments(),
      this.threadModel.countDocuments({ isDeleted: false }),
      this.commentModel.countDocuments({ isDeleted: false }),
      this.contentModel.countDocuments({ status: 'pending' }),
      this.newsArticleModel.countDocuments({ state: 'in_review' }),
    ]);

    return {
      users: {
        total: totalUsers,
      },
      content: {
        total: totalContent,
        pending: pendingContent,
        approved: await this.contentModel.countDocuments({ status: 'approved' }),
        rejected: await this.contentModel.countDocuments({ status: 'rejected' }),
      },
      news: {
        total: totalNews,
        pending: pendingNews,
        published: await this.newsArticleModel.countDocuments({ state: 'published' }),
        draft: await this.newsArticleModel.countDocuments({ state: 'draft' }),
      },
      engagement: {
        threads: totalThreads,
        comments: totalComments,
      },
    };
  }

  async getPendingContent(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const content = await this.contentModel
      .find({ status: 'pending' })
      .populate('contributor', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.contentModel.countDocuments({ status: 'pending' });

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

  async getPendingNews(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const news = await this.newsArticleModel
      .find({ state: 'in_review' })
      .populate('author', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.newsArticleModel.countDocuments({ state: 'in_review' });

    return {
      news,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }

  async getAllUsers(page: number = 1, limit: number = 20, role?: string) {
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (role) filter.role = role;

    const users = await this.userModel
      .find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.userModel.countDocuments(filter);

    return {
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }

  async updateUserRole(userId: string, role: string) {
    const allowedRoles = ['user', 'moderator', 'admin'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role');
    }

    const user = await this.userModel.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }
}
