import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as bcrypt from 'bcryptjs';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 50 })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, minlength: 6, select: false })
  password: string;

  @Prop({ trim: true })
  avatar?: string;

  @Prop({ enum: ['user', 'admin', 'moderator'], default: 'user', index: true })
  role: string;

  @Prop({ default: false, index: true })
  isVerified: boolean;

  @Prop()
  verificationToken?: string;

  @Prop()
  resetPasswordToken?: string;

  @Prop({ type: Date })
  resetPasswordExpires?: Date;

  @Prop({
    type: {
      favoriteTeams: [String],
      favoriteSports: { type: [String], enum: ['cricket', 'football'], default: [] },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        matchUpdates: { type: Boolean, default: true },
        contentUpdates: { type: Boolean, default: true },
      },
    },
    default: {},
  })
  preferences: {
    favoriteTeams: string[];
    favoriteSports: string[];
    notifications: {
      email: boolean;
      push: boolean;
      matchUpdates: boolean;
      contentUpdates: boolean;
    };
  };

  @Prop({
    type: {
      contentSubmitted: { type: Number, default: 0, min: 0 },
      contentApproved: { type: Number, default: 0, min: 0 },
      totalViews: { type: Number, default: 0, min: 0 },
      totalLikes: { type: Number, default: 0, min: 0 },
    },
    default: {},
  })
  stats: {
    contentSubmitted: number;
    contentApproved: number;
    totalViews: number;
    totalLikes: number;
  };

  @Prop({ type: Date })
  lastLogin?: Date;

  // Virtuals
  approvalRate?: number;
  engagementScore?: number;

  // Methods
  comparePassword?: (candidatePassword: string) => Promise<boolean>;
  isAdmin?: () => boolean;
  isModerator?: () => boolean;
  updateLastLogin?: () => Promise<UserDocument>;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isVerified: 1 });
UserSchema.index({ createdAt: -1 });

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user is admin
UserSchema.methods.isAdmin = function (): boolean {
  return this.role === 'admin';
};

// Method to check if user is moderator
UserSchema.methods.isModerator = function (): boolean {
  return this.role === 'moderator' || this.role === 'admin';
};

// Method to update last login
UserSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

// Virtual for approval rate
UserSchema.virtual('approvalRate').get(function () {
  if (this.stats.contentSubmitted === 0) return 0;
  return (this.stats.contentApproved / this.stats.contentSubmitted) * 100;
});

// Virtual for engagement score
UserSchema.virtual('engagementScore').get(function () {
  return this.stats.totalViews + this.stats.totalLikes * 2;
});




