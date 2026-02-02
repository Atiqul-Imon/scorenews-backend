import { Injectable, ConflictException, BadRequestException, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ScorerRegistrationDto } from './dto/scorer-registration.dto';
import { LocalMatchService } from '../cricket/services/local-match.service';
import * as crypto from 'crypto';

@Injectable()
export class ScorerService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => LocalMatchService))
    private localMatchService: LocalMatchService,
  ) {}

  async registerScorer(registerDto: ScorerRegistrationDto) {
    const { name, phone, email, password, location, scorerType, termsAccepted } = registerDto;

    // Validate terms acceptance
    if (!termsAccepted) {
      throw new BadRequestException('You must accept the terms and conditions');
    }

    // Check if phone number is already registered
    const existingUserByPhone = await this.userModel.findOne({
      'scorerProfile.phone': phone,
    });

    if (existingUserByPhone) {
      throw new ConflictException('Phone number is already registered as a scorer');
    }

    // Check if email is already registered (if provided)
    if (email) {
      const existingUserByEmail = await this.userModel.findOne({ email: email.toLowerCase() });
      if (existingUserByEmail) {
        throw new ConflictException('Email is already registered');
      }
    }

    // Generate unique scorer ID
    const scorerId = `SCR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Determine verification status
    // Official scorers need verification, others are auto-approved
    const verificationStatus = scorerType === 'official' ? 'pending' : 'verified';

    // Create user with scorer profile
    const userData: any = {
      name,
      email: email?.toLowerCase() || `scorer-${phone.replace(/\D/g, '')}@scorenews.net`, // Generate email if not provided
      password: password, // User-provided password
      role: 'scorer',
      isVerified: verificationStatus === 'verified',
      scorerProfile: {
        isScorer: true,
        scorerId,
        scorerType,
        verificationStatus,
        location,
        matchesScored: 0,
        accuracyScore: 100,
        assignedLeagues: [],
        phone,
      },
    };

    const user = new this.userModel(userData);
    await user.save();

    return {
      success: true,
      data: {
        scorerId,
        verificationStatus,
        message: verificationStatus === 'verified'
          ? 'Scorer registration successful! You can now login.'
          : 'Scorer registration submitted. Your account will be verified by an admin.',
      },
    };
  }

  async getScorerProfile(userId: string) {
    const user = await this.userModel.findById(userId).select('+scorerProfile');
    
    if (!user || !user.scorerProfile?.isScorer) {
      throw new BadRequestException('User is not a registered scorer');
    }

    return {
      success: true,
      data: {
        ...user.toObject(),
        scorerProfile: user.scorerProfile,
      },
    };
  }

  async getScorerMatches(
    userId: string,
    filters?: {
      status?: 'upcoming' | 'live' | 'completed';
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const user = await this.userModel.findById(userId).select('+scorerProfile');
    
    if (!user || !user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new BadRequestException('User is not a registered scorer');
    }

    const result = await this.localMatchService.getMatchesByScorer(
      user.scorerProfile.scorerId,
      filters,
    );

    // Transform LocalMatch to match frontend expectations
    const transformedMatches = result.matches.map((match) => ({
      matchId: match.matchId,
      series: match.series,
      matchType: match.matchType,
      isLocalMatch: match.isLocalMatch,
      teams: match.teams,
      venue: match.venue,
      status: match.status,
      format: match.format,
      startTime: match.startTime.toISOString(),
      endTime: match.endTime?.toISOString(),
      currentScore: match.currentScore,
      localLocation: match.localLocation,
      localLeague: match.localLeague,
      scorerInfo: match.scorerInfo,
      isVerified: match.isVerified,
      matchNote: match.matchNote,
      matchSetup: (match as any).matchSetup,
      liveState: (match as any).liveState,
      createdAt: (match as any).createdAt?.toISOString(),
      updatedAt: (match as any).updatedAt?.toISOString(),
    }));

    return {
      success: true,
      data: {
        data: transformedMatches,
        pagination: {
          current: result.page,
          pages: Math.ceil(result.total / result.limit),
          total: result.total,
          limit: result.limit,
        },
      },
    };
  }

  async getScorerMatchById(userId: string, matchId: string) {
    const user = await this.userModel.findById(userId).select('+scorerProfile');
    
    if (!user || !user.scorerProfile?.isScorer || !user.scorerProfile?.scorerId) {
      throw new BadRequestException('User is not a registered scorer');
    }

    // Get match with includeUnverified = true (scorer can see their own matches)
    const match = await this.localMatchService.getMatchById(matchId, true);
    
    // Verify the scorer owns this match
    if (match.scorerInfo.scorerId !== user.scorerProfile.scorerId) {
      throw new ForbiddenException('You can only access matches you created');
    }

    // Transform LocalMatch to match frontend expectations
    const transformedMatch = {
      matchId: match.matchId,
      series: match.series,
      matchType: match.matchType,
      isLocalMatch: match.isLocalMatch,
      teams: match.teams,
      venue: match.venue,
      status: match.status,
      format: match.format,
      startTime: match.startTime.toISOString(),
      endTime: match.endTime?.toISOString(),
      currentScore: match.currentScore,
      localLocation: match.localLocation,
      localLeague: match.localLeague,
      scorerInfo: match.scorerInfo,
      isVerified: match.isVerified,
      matchNote: match.matchNote,
      matchSetup: (match as any).matchSetup,
      liveState: (match as any).liveState,
      battingStats: (match as any).battingStats,
      bowlingStats: (match as any).bowlingStats,
      isLocked: (match as any).isLocked,
      createdAt: (match as any).createdAt?.toISOString(),
      updatedAt: (match as any).updatedAt?.toISOString(),
    };

    return {
      success: true,
      data: transformedMatch,
    };
  }
}

