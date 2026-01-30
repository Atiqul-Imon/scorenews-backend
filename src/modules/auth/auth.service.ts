import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { EmailService } from '../../common/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    // Check if user exists
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('User already exists with this email');
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = new this.userModel({
      name,
      email,
      password,
      verificationToken,
      isVerified: false,
    });

    await user.save();

    // Generate tokens
    const tokens = await this.generateTokens(user._id.toString());

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      // Don't fail registration if email fails
      console.error('Error sending verification email:', error);
    }

    return {
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: {
        user: this.sanitizeUser(user),
        ...tokens,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { emailOrPhone, password } = loginDto;

    // Try to find user by email first, then by phone number
    let user = await this.userModel.findOne({ email: emailOrPhone.toLowerCase() }).select('+password');
    
    // If not found by email, try phone number (for scorers)
    if (!user) {
      user = await this.userModel.findOne({ 'scorerProfile.phone': emailOrPhone }).select('+password');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    // Check password
    const isPasswordValid = await (user as any).comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    // Update last login
    await (user as any).updateLastLogin();

    // Generate tokens
    const tokens = await this.generateTokens(user._id.toString());

    return {
      success: true,
      message: 'Login successful',
      data: {
        user: this.sanitizeUser(user),
        ...tokens,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userModel.findById(payload.userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user._id.toString());
      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async generateTokens(userId: string) {
    const payload = { userId };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      token: accessToken,
      refreshToken,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();

    // Send reset email
    try {
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      throw new InternalServerErrorException('Error sending password reset email');
    }

    return {
      success: true,
      message: 'Password reset email sent',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, password } = resetPasswordDto;

    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return {
      success: true,
      message: 'Password reset successful',
    };
  }

  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({ verificationToken: token });
    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  async resendVerification(resendVerificationDto: ResendVerificationDto) {
    const { email } = resendVerificationDto;

    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      throw new InternalServerErrorException('Error sending verification email');
    }

    return {
      success: true,
      message: 'Verification email sent',
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.userModel.findById(userId).select('+password');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check current password
    const isCurrentPasswordValid = await (user as any).comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    user.password = newPassword;
    await user.save();

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateProfileDto.name) user.name = updateProfileDto.name;
    if (updateProfileDto.avatar) user.avatar = updateProfileDto.avatar;
    if (updateProfileDto.preferences) {
      if (updateProfileDto.preferences.favoriteTeams) {
        user.preferences.favoriteTeams = updateProfileDto.preferences.favoriteTeams;
      }
      if (updateProfileDto.preferences.favoriteSports) {
        user.preferences.favoriteSports = updateProfileDto.preferences.favoriteSports;
      }
      if (updateProfileDto.preferences.notifications) {
        user.preferences.notifications = {
          ...user.preferences.notifications,
          ...updateProfileDto.preferences.notifications,
        };
      }
    }

    await user.save();

    return {
      success: true,
      data: this.sanitizeUser(user),
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userModel.findByIdAndDelete(userId);

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  private sanitizeUser(user: UserDocument) {
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.verificationToken;
    delete userObj.resetPasswordToken;
    delete userObj.resetPasswordExpires;
    return userObj;
  }
}

