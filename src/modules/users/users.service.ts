import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Content, ContentDocument } from '../content/schemas/content.schema';
import { RedisService } from '../../redis/redis.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Content.name) private contentModel: Model<ContentDocument>,
    private redisService: RedisService,
  ) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-password');
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).select('-password');
  }

  async findAll(filters: any = {}) {
    const { page = 1, limit = 20, role, search } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const filter: any = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: new RegExp(search as string, 'i') },
        { email: new RegExp(search as string, 'i') },
      ];
    }

    const users = await this.userModel
      .find(filter)
      .select('-password -verificationToken -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await this.userModel.countDocuments(filter);

    return {
      users,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total,
        limit: Number(limit),
      },
    };
  }

  async getUserById(id: string) {
    // Try to get from cache first
    const cachedData = await this.redisService.get(`user:${id}`);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const user = await this.userModel
      .findById(id)
      .select('-password -verificationToken -resetPasswordToken -resetPasswordExpires')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cache for 5 minutes
    await this.redisService.set(`user:${id}`, JSON.stringify(user), 300);

    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto, currentUserId: string, currentUserRole: string) {
    // Check if user can update this profile
    if (id !== currentUserId && !['admin', 'moderator'].includes(currentUserRole)) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Only admin can change role and verification status
    if (currentUserRole === 'admin') {
      if (updateUserDto.role) user.role = updateUserDto.role;
      if (updateUserDto.isVerified !== undefined) user.isVerified = updateUserDto.isVerified;
    }

    if (updateUserDto.name) user.name = updateUserDto.name;
    if (updateUserDto.avatar) user.avatar = updateUserDto.avatar;

    await user.save();

    // Clear cache
    await this.redisService.del(`user:${id}`);

    return user;
  }

  async deleteUser(id: string, currentUserId: string, currentUserRole: string) {
    // Check if user can delete this profile
    if (id !== currentUserId && currentUserRole !== 'admin') {
      throw new ForbiddenException('You can only delete your own profile');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete user's content
    await this.contentModel.deleteMany({ contributor: id });

    // Delete user
    await this.userModel.findByIdAndDelete(id);

    // Clear cache
    await this.redisService.del(`user:${id}`);

    return { message: 'User deleted successfully' };
  }

  async getUserStats(id: string) {
    const user = await this.userModel.findById(id).select('stats');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get additional stats
    const contentCount = await this.contentModel.countDocuments({ contributor: id });
    const approvedContentCount = await this.contentModel.countDocuments({
      contributor: id,
      status: 'approved',
    });
    const totalViewsResult = await this.contentModel.aggregate([
      { $match: { contributor: user._id } },
      { $group: { _id: null, totalViews: { $sum: '$views' } } },
    ]);

    return {
      ...user.stats,
      contentCount,
      approvedContentCount,
      totalViews: totalViewsResult[0]?.totalViews || 0,
      approvalRate: contentCount > 0 ? (approvedContentCount / contentCount) * 100 : 0,
    };
  }

  async getTopContributors(limit: number = 10) {
    // Try to get from cache first
    const cacheKey = `top_contributors:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const contributors = await this.userModel.aggregate([
      { $match: { role: 'user' } },
      {
        $lookup: {
          from: 'content',
          localField: '_id',
          foreignField: 'contributor',
          as: 'content',
        },
      },
      {
        $addFields: {
          totalContent: { $size: '$content' },
          approvedContent: {
            $size: {
              $filter: {
                input: '$content',
                cond: { $eq: ['$$this.status', 'approved'] },
              },
            },
          },
          totalViews: { $sum: '$content.views' },
          totalLikes: { $sum: '$content.likes' },
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          totalContent: 1,
          approvedContent: 1,
          totalViews: 1,
          totalLikes: 1,
          engagementScore: {
            $add: [
              { $multiply: ['$totalViews', 0.1] },
              { $multiply: ['$totalLikes', 1] },
              { $multiply: ['$approvedContent', 5] },
            ],
          },
        },
      },
      { $sort: { engagementScore: -1 } },
      { $limit: limit },
    ]);

    // Cache for 1 hour
    await this.redisService.set(cacheKey, JSON.stringify(contributors), 3600);

    return contributors;
  }

  async getUserContent(id: string, filters: any = {}) {
    const { page = 1, limit = 20, status, type } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const filter: any = { contributor: id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const content = await this.contentModel
      .find(filter)
      .populate('contributor', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await this.contentModel.countDocuments(filter);

    return {
      content,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total,
        limit: Number(limit),
      },
    };
  }

  async followUser(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already following
    const currentUser = await this.userModel.findById(currentUserId);
    if (currentUser?.preferences.favoriteTeams?.includes(id)) {
      throw new BadRequestException('You are already following this user');
    }

    // Add to following list
    await this.userModel.findByIdAndUpdate(currentUserId, {
      $addToSet: { 'preferences.favoriteTeams': id },
    });

    return { message: 'User followed successfully' };
  }

  async unfollowUser(id: string, currentUserId: string) {
    await this.userModel.findByIdAndUpdate(currentUserId, {
      $pull: { 'preferences.favoriteTeams': id },
    });

    return { message: 'User unfollowed successfully' };
  }

  async getFollowers(id: string, filters: any = {}) {
    const { page = 1, limit = 20 } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const followers = await this.userModel
      .find({
        'preferences.favoriteTeams': id,
      })
      .select('name email avatar stats')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await this.userModel.countDocuments({
      'preferences.favoriteTeams': id,
    });

    return {
      followers,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total,
        limit: Number(limit),
      },
    };
  }

  async getFollowing(id: string, filters: any = {}) {
    const { page = 1, limit = 20 } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const user = await this.userModel.findById(id).select('preferences.favoriteTeams');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const following = await this.userModel
      .find({
        _id: { $in: user.preferences.favoriteTeams },
      })
      .select('name email avatar stats')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = user.preferences.favoriteTeams.length;

    return {
      following,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total,
        limit: Number(limit),
      },
    };
  }

  async updatePreferences(userId: string, updatePreferencesDto: UpdatePreferencesDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updatePreferencesDto.favoriteTeams) {
      user.preferences.favoriteTeams = updatePreferencesDto.favoriteTeams;
    }
    if (updatePreferencesDto.favoriteSports) {
      user.preferences.favoriteSports = updatePreferencesDto.favoriteSports;
    }
    if (updatePreferencesDto.notifications) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...updatePreferencesDto.notifications,
      };
    }

    await user.save();

    // Clear cache
    await this.redisService.del(`user:${userId}`);

    return user.preferences;
  }

  async getNotifications(userId: string, filters: any = {}) {
    const { page = 1, limit = 20 } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    // This would typically come from a notifications collection
    // For now, we'll return a mock response
    const notifications: any[] = [];

    return {
      notifications,
      pagination: {
        current: Number(page),
        pages: 0,
        total: 0,
        limit: Number(limit),
      },
    };
  }

  async markNotificationAsRead(notificationId: string, userId: string) {
    // This would typically update a notifications collection
    // For now, we'll return a success response
    return { message: 'Notification marked as read' };
  }

  async deleteNotification(notificationId: string, userId: string) {
    // This would typically delete from a notifications collection
    // For now, we'll return a success response
    return { message: 'Notification deleted' };
  }

  async incrementContentSubmitted(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { 'stats.contentSubmitted': 1 },
    });
  }

  async decrementContentSubmitted(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { 'stats.contentSubmitted': -1 },
    });
  }

  async incrementContentApproved(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { 'stats.contentApproved': 1 },
    });
  }
}

