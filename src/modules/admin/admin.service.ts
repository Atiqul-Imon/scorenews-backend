import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Content, ContentDocument } from '../content/schemas/content.schema';
import { NewsArticle, NewsArticleDocument } from '../news/schemas/news-article.schema';
import { Thread, ThreadDocument } from '../threads/schemas/thread.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';
import { CricketMatch, CricketMatchDocument } from '../cricket/schemas/cricket-match.schema';
import { LocalMatch, LocalMatchDocument } from '../cricket/schemas/local-match.schema';
import { LocalMatchService } from '../cricket/services/local-match.service';
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
    @InjectModel(LocalMatch.name) private localMatchModel: Model<LocalMatchDocument>,
    @Inject(forwardRef(() => LocalMatchService))
    private localMatchService: LocalMatchService,
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

    if (!scorer || !scorer.scorerProfile || !scorer.scorerProfile.scorerId) {
      throw new NotFoundException('Scorer not found');
    }

    // Use LocalMatchService to get matches (it queries the correct collection)
    const result = await this.localMatchService.getMatchesByScorer(
      scorer.scorerProfile.scorerId,
      {
        status: filters?.status as 'upcoming' | 'live' | 'completed' | undefined,
        page,
        limit,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
      }
    );

    return {
      matches: result.matches,
      pagination: {
        current: result.page,
        pages: Math.ceil(result.total / result.limit),
        total: result.total,
        limit: result.limit,
      },
    };
  }

  // Local Match Management Methods
  async getAllLocalMatches(
    page: number = 1,
    limit: number = 20,
    filters?: {
      status?: string;
      city?: string;
      district?: string;
      scorerId?: string;
      isVerified?: boolean;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const query: any = { isLocalMatch: true };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.city) {
      query['localLocation.city'] = new RegExp(filters.city, 'i');
    }

    if (filters?.district) {
      query['localLocation.district'] = new RegExp(filters.district, 'i');
    }

    if (filters?.scorerId) {
      query['scorerInfo.scorerId'] = filters.scorerId;
    }

    if (filters?.isVerified !== undefined) {
      query.isVerified = filters.isVerified;
    }

    if (filters?.search) {
      query.$or = [
        { series: new RegExp(filters.search, 'i') },
        { 'teams.home.name': new RegExp(filters.search, 'i') },
        { 'teams.away.name': new RegExp(filters.search, 'i') },
        { 'venue.name': new RegExp(filters.search, 'i') },
        { matchId: new RegExp(filters.search, 'i') },
      ];
    }

    if (filters?.startDate || filters?.endDate) {
      query.startTime = {};
      if (filters.startDate) query.startTime.$gte = new Date(filters.startDate);
      if (filters.endDate) query.startTime.$lte = new Date(filters.endDate);
    }

    // Admin can see all matches (verified and unverified)
    // Don't filter by isVerified for admin panel
    const [matches, total] = await Promise.all([
      this.localMatchModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.localMatchModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        matches,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      },
    };
  }

  async getLocalMatchById(matchId: string) {
    try {
      // Admin can access both verified and unverified matches
      const match = await this.localMatchService.getMatchById(matchId, true);
      return {
        success: true,
        data: match,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Local match with ID ${matchId} not found`);
    }
  }

  async updateLocalMatchVerification(matchId: string, isVerified: boolean) {
    const match = await this.localMatchModel.findOne({ matchId });
    
    if (!match) {
      throw new NotFoundException(`Local match with ID ${matchId} not found`);
    }

    match.isVerified = isVerified;
    if (isVerified) {
      match.scorerInfo.verificationStatus = 'verified';
    }
    await match.save();

    this.logger.log(`Local match ${matchId} verification status updated to ${isVerified}`, 'AdminService');

    return {
      success: true,
      message: `Match verification status updated to ${isVerified ? 'verified' : 'unverified'}`,
      data: {
        matchId: match.matchId,
        isVerified: match.isVerified,
      },
    };
  }

  async updateLocalMatchStatus(matchId: string, status: 'live' | 'completed' | 'upcoming' | 'cancelled') {
    const match = await this.localMatchModel.findOne({ matchId });
    
    if (!match) {
      throw new NotFoundException(`Local match with ID ${matchId} not found`);
    }

    const oldStatus = match.status;
    match.status = status;

    // If marking as completed or cancelled, set endTime if not already set
    if ((status === 'completed' || status === 'cancelled') && !match.endTime) {
      match.endTime = new Date();
    }

    // If marking as live from another status, ensure it's verified
    if (status === 'live' && !match.isVerified) {
      match.isVerified = true;
      match.scorerInfo.verificationStatus = 'verified';
    }

    await match.save();

    this.logger.log(`Local match ${matchId} status updated from ${oldStatus} to ${status}`, 'AdminService');

    return {
      success: true,
      message: `Match status updated from ${oldStatus} to ${status}`,
      data: {
        matchId: match.matchId,
        status: match.status,
        previousStatus: oldStatus,
      },
    };
  }

  async updateLocalMatch(matchId: string, updateData: any) {
    const match = await this.localMatchModel.findOne({ matchId });
    
    if (!match) {
      throw new NotFoundException(`Local match with ID ${matchId} not found`);
    }

    // Allow updating specific fields
    const allowedFields = ['series', 'status', 'venue', 'localLocation', 'localLeague'];
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        (match as any)[field] = updateData[field];
      }
    }

    await match.save();

    this.logger.log(`Local match ${matchId} updated`, 'AdminService');

    return {
      success: true,
      message: 'Match updated successfully',
      data: match.toObject(),
    };
  }

  async deleteLocalMatch(matchId: string) {
    const match = await this.localMatchModel.findOne({ matchId });
    
    if (!match) {
      throw new NotFoundException(`Local match with ID ${matchId} not found`);
    }

    await this.localMatchModel.deleteOne({ matchId });

    this.logger.log(`Local match ${matchId} deleted`, 'AdminService');

    return {
      success: true,
      message: 'Match deleted successfully',
    };
  }
}
