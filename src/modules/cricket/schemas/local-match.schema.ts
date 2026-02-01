import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LocalMatchDocument = LocalMatch & Document;

@Schema({ timestamps: true, collection: 'local_cricket_matches' })
export class LocalMatch {
  @Prop({ required: true, unique: true, index: true })
  matchId: string;

  @Prop({ required: true, index: true })
  series: string;

  @Prop({
    type: {
      home: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        flag: { type: String, default: '' },
        shortName: { type: String, required: true },
      },
      away: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        flag: { type: String, default: '' },
        shortName: { type: String, required: true },
      },
    },
    required: true,
  })
  teams: {
    home: { id: string; name: string; flag: string; shortName: string };
    away: { id: string; name: string; flag: string; shortName: string };
  };

  @Prop({
    type: {
      name: { type: String, required: true },
      city: { type: String, required: true },
      country: { type: String, required: true },
      address: { type: String },
    },
    required: true,
  })
  venue: {
    name: string;
    city: string;
    country: string;
    address?: string;
  };

  @Prop({
    enum: ['live', 'completed', 'upcoming', 'cancelled'],
    required: true,
    default: 'upcoming',
    index: true,
  })
  status: 'live' | 'completed' | 'upcoming' | 'cancelled';

  @Prop({
    enum: ['test', 'odi', 't20i', 't20', 'first-class', 'list-a'],
    required: true,
    index: true,
  })
  format: string;

  @Prop({ required: true, index: true })
  startTime: Date;

  @Prop()
  endTime?: Date;

  @Prop({
    type: {
      home: {
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        overs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
      },
      away: {
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        overs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
      },
    },
  })
  currentScore?: {
    home: { runs: number; wickets: number; overs: number; balls: number };
    away: { runs: number; wickets: number; overs: number; balls: number };
  };

  // Local match specific fields
  @Prop({
    type: {
      country: { type: String, required: true },
      state: { type: String },
      city: { type: String, required: true },
      district: { type: String },
      area: { type: String },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    required: true,
    index: true,
  })
  localLocation: {
    country: string;
    state?: string;
    city: string;
    district?: string;
    area?: string;
    coordinates?: { lat: number; lng: number };
  };

  @Prop({
    type: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      level: {
        type: String,
        enum: ['national', 'state', 'district', 'city', 'ward', 'club'],
        required: true,
      },
      season: { type: String, required: true },
      year: { type: Number, required: true },
    },
  })
  localLeague?: {
    id: string;
    name: string;
    level: 'national' | 'state' | 'district' | 'city' | 'ward' | 'club';
    season: string;
    year: number;
  };

  @Prop({
    type: {
      scorerId: { type: String, required: true, index: true },
      scorerName: { type: String, required: true },
      scorerType: {
        type: String,
        enum: ['official', 'volunteer', 'community'],
        required: true,
      },
      lastUpdate: { type: Date, default: Date.now },
      verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending',
      },
    },
    required: true,
  })
  scorerInfo: {
    scorerId: string;
    scorerName: string;
    scorerType: 'official' | 'volunteer' | 'community';
    lastUpdate: Date;
    verificationStatus: 'pending' | 'verified' | 'rejected';
  };

  @Prop({ default: false, index: true })
  isVerified: boolean;

  @Prop()
  matchNote?: string;

  // Match type indicator
  @Prop({ default: true })
  isLocalMatch: boolean;

  @Prop({
    enum: ['international', 'franchise', 'local', 'hyper-local'],
    default: 'local',
  })
  matchType: 'international' | 'franchise' | 'local' | 'hyper-local';
}

export const LocalMatchSchema = SchemaFactory.createForClass(LocalMatch);

// Indexes for better query performance
LocalMatchSchema.index({ 'scorerInfo.scorerId': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.city': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.district': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.area': 1, status: 1 });
LocalMatchSchema.index({ startTime: -1 });

