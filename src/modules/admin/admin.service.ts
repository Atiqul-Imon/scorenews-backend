import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Content, ContentDocument } from '../content/schemas/content.schema';
import { NewsArticle, NewsArticleDocument } from '../news/schemas/news-article.schema';
import { Thread, ThreadDocument } from '../threads/schemas/thread.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';
import { CricketMatch, CricketMatchDocument } from '../cricket/schemas/cricket-match.schema';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Content.name) private contentModel: Model<ContentDocument>,
    @InjectModel(NewsArticle.name) private newsArticleModel: Model<NewsArticleDocument>,
    @InjectModel(Thread.name) private threadModel: Model<ThreadDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(CricketMatch.name) private cricketMatchModel: Model<CricketMatchDocument>,
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

  // Scorer Management Methods
  async getScorerStats() {
    const [
      totalScorers,
      verifiedScorers,
      pendingScorers,
      suspendedScorers,
      officialScorers,
      volunteerScorers,
      communityScorers,
      totalMatches,
      activeMatches,
    ] = await Promise.all([
      this.userModel.countDocuments({ 'scorerProfile.isScorer': true }),
      this.userModel.countDocuments({ 'scorerProfile.verificationStatus': 'verified' }),
      this.userModel.countDocuments({ 'scorerProfile.verificationStatus': 'pending' }),
      this.userModel.countDocuments({ 'scorerProfile.verificationStatus': 'suspended' }),
      this.userModel.countDocuments({ 'scorerProfile.scorerType': 'official' }),
      this.userModel.countDocuments({ 'scorerProfile.scorerType': 'volunteer' }),
      this.userModel.countDocuments({ 'scorerProfile.scorerType': 'community' }),
      this.cricketMatchModel.countDocuments({ matchType: { $in: ['local', 'hyper-local'] } }),
      this.cricketMatchModel.countDocuments({ 
        matchType: { $in: ['local', 'hyper-local'] },
        status: 'live'
      }),
    ]);

    // Get top scorers by matches scored
    const topScorers = await this.userModel
      .find({ 'scorerProfile.isScorer': true })
      .select('name email scorerProfile')
      .sort({ 'scorerProfile.matchesScored': -1 })
      .limit(10)
      .lean();

    return {
      total: totalScorers,
      verified: verifiedScorers,
      pending: pendingScorers,
      suspended: suspendedScorers,
      byType: {
        official: officialScorers,
        volunteer: volunteerScorers,
        community: communityScorers,
      },
      matches: {
        total: totalMatches,
        active: activeMatches,
      },
      topScorers: topScorers.map((scorer: any) => ({
        id: scorer._id.toString(),
        name: scorer.name,
        email: scorer.email,
        scorerId: scorer.scorerProfile?.scorerId,
        matchesScored: scorer.scorerProfile?.matchesScored || 0,
        accuracyScore: scorer.scorerProfile?.accuracyScore || 100,
        verificationStatus: scorer.scorerProfile?.verificationStatus,
      })),
    };
  }

  async getAllScorers(
    page: number = 1,
    limit: number = 20,
    filters?: {
      verificationStatus?: string;
      scorerType?: string;
      city?: string;
      search?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const filter: any = { 'scorerProfile.isScorer': true };

    if (filters?.verificationStatus) {
      filter['scorerProfile.verificationStatus'] = filters.verificationStatus;
    }

    if (filters?.scorerType) {
      filter['scorerProfile.scorerType'] = filters.scorerType;
    }

    if (filters?.city) {
      filter['scorerProfile.location.city'] = new RegExp(filters.city, 'i');
    }

    if (filters?.search) {
      filter.$or = [
        { name: new RegExp(filters.search, 'i') },
        { email: new RegExp(filters.search, 'i') },
        { 'scorerProfile.scorerId': new RegExp(filters.search, 'i') },
        { 'scorerProfile.phone': new RegExp(filters.search, 'i') },
      ];
    }

    const scorers = await this.userModel
      .find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.userModel.countDocuments(filter);

    return {
      scorers: scorers.map((scorer: any) => ({
        id: scorer._id.toString(),
        name: scorer.name,
        email: scorer.email,
        role: scorer.role,
        isVerified: scorer.isVerified,
        scorerProfile: scorer.scorerProfile,
        createdAt: scorer.createdAt || new Date(),
        lastLogin: scorer.lastLogin,
      })),
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }

  async getScorerById(scorerId: string) {
    const scorer = await this.userModel
      .findOne({
        $or: [
          { _id: scorerId },
          { 'scorerProfile.scorerId': scorerId },
        ],
        'scorerProfile.isScorer': true,
      })
      .select('-password')
      .lean();

    if (!scorer) {
      throw new NotFoundException('Scorer not found');
    }

    // Get scorer's matches
    const matches = await this.cricketMatchModel
      .find({
        'scorerInfo.scorerId': (scorer as any).scorerProfile?.scorerId,
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return {
      scorer: {
        id: scorer._id.toString(),
        name: scorer.name,
        email: scorer.email,
        role: scorer.role,
        isVerified: scorer.isVerified,
        scorerProfile: scorer.scorerProfile,
        createdAt: (scorer as any).createdAt || new Date(),
        lastLogin: (scorer as any).lastLogin,
      },
      matches: {
        total: await this.cricketMatchModel.countDocuments({
          'scorerInfo.scorerId': (scorer as any).scorerProfile?.scorerId,
        }),
        recent: matches,
      },
    };
  }

  async updateScorerVerification(scorerId: string, verificationStatus: 'verified' | 'pending' | 'suspended') {
    const allowedStatuses = ['verified', 'pending', 'suspended'];
    if (!allowedStatuses.includes(verificationStatus)) {
      throw new BadRequestException('Invalid verification status');
    }

    const user = await this.userModel.findOne({
      $or: [
        { _id: scorerId },
        { 'scorerProfile.scorerId': scorerId },
      ],
      'scorerProfile.isScorer': true,
    });

    if (!user) {
      throw new NotFoundException('Scorer not found');
    }

    if (!user.scorerProfile) {
      throw new BadRequestException('User is not a scorer');
    }

    user.scorerProfile.verificationStatus = verificationStatus;
    
    // If verified, also mark user as verified
    if (verificationStatus === 'verified') {
      user.isVerified = true;
    }

    await user.save();

    this.logger.log(`Scorer ${user.scorerProfile.scorerId} verification status updated to ${verificationStatus}`, 'AdminService');

    return {
      success: true,
      message: `Scorer verification status updated to ${verificationStatus}`,
      data: {
        id: user._id.toString(),
        scorerId: user.scorerProfile.scorerId,
        verificationStatus: user.scorerProfile.verificationStatus,
      },
    };
  }

  async getScorerMatches(
    scorerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; startDate?: string; endDate?: string },
  ) {
    const scorer = await this.userModel.findOne({
      $or: [
        { _id: scorerId },
        { 'scorerProfile.scorerId': scorerId },
      ],
      'scorerProfile.isScorer': true,
    }).select('scorerProfile');

    if (!scorer || !scorer.scorerProfile) {
      throw new NotFoundException('Scorer not found');
    }

    const skip = (page - 1) * limit;
    const filter: any = {
      'scorerInfo.scorerId': scorer.scorerProfile.scorerId,
    };

    if (filters?.status) {
      filter.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      filter.startTime = {};
      if (filters.startDate) filter.startTime.$gte = new Date(filters.startDate);
      if (filters.endDate) filter.startTime.$lte = new Date(filters.endDate);
    }

    const matches = await this.cricketMatchModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.cricketMatchModel.countDocuments(filter);

    return {
      matches,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }
}
