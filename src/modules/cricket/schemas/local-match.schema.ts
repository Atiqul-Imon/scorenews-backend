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

  // Ball-by-ball scoring fields
  @Prop({
    type: {
      isSetupComplete: { type: Boolean, default: false },
      tossWinner: { type: String, enum: ['home', 'away'] },
      tossDecision: { type: String, enum: ['bat', 'bowl'] },
      homePlayingXI: [{
        id: { type: String },
        name: { type: String },
        role: { type: String },
      }],
      awayPlayingXI: [{
        id: { type: String },
        name: { type: String },
        role: { type: String },
      }],
    },
  })
  matchSetup?: {
    isSetupComplete: boolean;
    tossWinner?: 'home' | 'away';
    tossDecision?: 'bat' | 'bowl';
    homePlayingXI?: Array<{ id: string; name: string; role?: string }>;
    awayPlayingXI?: Array<{ id: string; name: string; role?: string }>;
  };

  @Prop({
    type: {
      currentInnings: { type: Number, default: 1 },
      battingTeam: { type: String, enum: ['home', 'away'] },
      strikerId: { type: String },
      nonStrikerId: { type: String },
      bowlerId: { type: String },
      currentOver: { type: Number, default: 0 },
      currentBall: { type: Number, default: 0 },
      isInningsBreak: { type: Boolean, default: false },
      partnershipRuns: { type: Number, default: 0 },
      partnershipBalls: { type: Number, default: 0 },
      currentRunRate: { type: Number, default: 0 },
      requiredRunRate: { type: Number },
      target: { type: Number },
    },
  })
  liveState?: {
    currentInnings: number;
    battingTeam?: 'home' | 'away';
    strikerId?: string;
    nonStrikerId?: string;
    bowlerId?: string;
    currentOver: number;
    currentBall: number;
    isInningsBreak: boolean;
    partnershipRuns?: number;
    partnershipBalls?: number;
    currentRunRate?: number;
    requiredRunRate?: number;
    target?: number;
  };

  @Prop({
    type: [{
      innings: { type: Number, required: true },
      over: { type: Number, required: true },
      ball: { type: Number, required: true },
      strikerId: { type: String, required: true },
      nonStrikerId: { type: String, required: true },
      bowlerId: { type: String, required: true },
      runs: { type: Number, default: 0 },
      ballType: { type: String, enum: ['normal', 'wide', 'no_ball', 'bye', 'leg_bye'], default: 'normal' },
      isWicket: { type: Boolean, default: false },
      dismissalType: { type: String, enum: ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt', 'retired_out', 'handled_ball', 'obstructing_field', 'timed_out'] },
      dismissedBatterId: { type: String },
      fielderId: { type: String },
      incomingBatterId: { type: String },
      isBoundary: { type: Boolean, default: false },
      isSix: { type: Boolean, default: false },
      timestamp: { type: Date, default: Date.now },
    }],
  })
  ballHistory?: Array<{
    innings: number;
    over: number;
    ball: number;
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
    runs: number;
    ballType: 'normal' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';
    isWicket: boolean;
    dismissalType?: string;
    dismissedBatterId?: string;
    fielderId?: string;
    incomingBatterId?: string;
    isBoundary: boolean;
    isSix: boolean;
    timestamp: Date;
  }>;

  @Prop({
    type: [{
      innings: { type: Number, required: true },
      team: { type: String, enum: ['home', 'away'], required: true },
      playerId: { type: String, required: true },
      playerName: { type: String, required: true },
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      fours: { type: Number, default: 0 },
      sixes: { type: Number, default: 0 },
      strikeRate: { type: Number, default: 0 },
      isOut: { type: Boolean, default: false },
      dismissalType: { type: String },
      dismissedBy: { type: String },
      fielderId: { type: String },
      fowScore: { type: Number },
      fowBalls: { type: Number },
    }],
  })
  battingStats?: Array<{
    innings: number;
    team: 'home' | 'away';
    playerId: string;
    playerName: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    isOut: boolean;
    dismissalType?: string;
    dismissedBy?: string;
    fielderId?: string;
    fowScore?: number;
    fowBalls?: number;
  }>;

  @Prop({
    type: [{
      innings: { type: Number, required: true },
      team: { type: String, enum: ['home', 'away'], required: true },
      playerId: { type: String, required: true },
      playerName: { type: String, required: true },
      overs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      maidens: { type: Number, default: 0 },
      runs: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      economy: { type: Number, default: 0 },
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
    }],
  })
  bowlingStats?: Array<{
    innings: number;
    team: 'home' | 'away';
    playerId: string;
    playerName: string;
    overs: number;
    balls?: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    wides: number;
    noBalls: number;
  }>;

  @Prop({ default: false })
  isLocked: boolean;

  @Prop({
    type: {
      winner: { type: String, enum: ['home', 'away', 'tie', 'no_result'] },
      margin: { type: String },
      keyPerformers: [{
        playerId: { type: String },
        playerName: { type: String },
        role: { type: String },
        performance: { type: String },
      }],
      notes: { type: String },
    },
  })
  matchResult?: {
    winner?: 'home' | 'away' | 'tie' | 'no_result';
    margin?: string;
    keyPerformers?: Array<{ playerId: string; playerName: string; role: string; performance: string }>;
    notes?: string;
  };
}

export const LocalMatchSchema = SchemaFactory.createForClass(LocalMatch);

// Indexes for better query performance
LocalMatchSchema.index({ 'scorerInfo.scorerId': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.city': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.district': 1, status: 1 });
LocalMatchSchema.index({ 'localLocation.area': 1, status: 1 });
LocalMatchSchema.index({ startTime: -1 });

