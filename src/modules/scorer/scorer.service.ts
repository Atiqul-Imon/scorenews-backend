import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ScorerRegistrationDto } from './dto/scorer-registration.dto';
import * as crypto from 'crypto';

@Injectable()
export class ScorerService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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

  async getScorerMatches(userId: string, filters?: { status?: string; page?: number; limit?: number }) {
    // This will be implemented when local cricket matches are created
    // For now, return empty array
    return {
      success: true,
      data: {
        matches: [],
        total: 0,
        page: filters?.page || 1,
        limit: filters?.limit || 10,
      },
    };
  }
}

