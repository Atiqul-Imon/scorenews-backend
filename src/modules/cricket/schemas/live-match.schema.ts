import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LiveMatchDocument = LiveMatch & Document;

@Schema({ timestamps: true, collection: 'cricket_live_matches' })
export class LiveMatch {
  @Prop({ required: true, unique: true, index: true })
  matchId: string;

  @Prop({ required: true, index: true })
  series: string;

  @Prop({
    type: {
      home: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        flag: { type: String, required: true },
        shortName: { type: String, required: true },
      },
      away: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        flag: { type: String, required: true },
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
      capacity: { type: Number },
    },
    required: true,
  })
  venue: {
    name: string;
    city: string;
    country: string;
    capacity?: number;
  };

  @Prop({
    enum: ['test', 'odi', 't20i', 't20', 'first-class', 'list-a'],
    required: true,
    index: true,
  })
  format: string;

  @Prop({ required: true, index: true })
  startTime: Date;

  @Prop({
    enum: ['live', 'completed', 'upcoming', 'cancelled'],
    default: 'live',
    index: true,
  })
  status?: 'live' | 'completed' | 'upcoming' | 'cancelled';

  // LIVE-SPECIFIC FIELDS
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
    required: true,
  })
  currentScore: {
    home: { runs: number; wickets: number; overs: number; balls: number };
    away: { runs: number; wickets: number; overs: number; balls: number };
  };

  @Prop({
    type: [
      {
        playerId: { type: String },
        playerName: { type: String, required: true },
        runs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
        fours: { type: Number, default: 0 },
        sixes: { type: Number, default: 0 },
        strikeRate: { type: Number, default: 0 },
        teamId: { type: String },
        teamName: { type: String, required: true },
      },
    ],
  })
  currentBatters?: Array<{
    playerId?: string;
    playerName: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    teamId?: string;
    teamName: string;
  }>;

  @Prop({
    type: [
      {
        playerId: { type: String },
        playerName: { type: String, required: true },
        overs: { type: Number, default: 0 },
        maidens: { type: Number, default: 0 },
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        economy: { type: Number, default: 0 },
        teamId: { type: String },
        teamName: { type: String, required: true },
      },
    ],
  })
  currentBowlers?: Array<{
    playerId?: string;
    playerName: string;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    teamId?: string;
    teamName: string;
  }>;

  @Prop({
    type: {
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      runRate: { type: String },
    },
  })
  partnership?: {
    runs: number;
    balls: number;
    runRate: string;
  };

  @Prop({
    type: {
      playerId: { type: String },
      playerName: { type: String, required: true },
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      fowScore: { type: Number },
      fowBalls: { type: Number },
    },
  })
  lastWicket?: {
    playerId?: string;
    playerName: string;
    runs: number;
    balls: number;
    fowScore?: number;
    fowBalls?: number;
  };

  @Prop({
    type: [
      {
        number: { type: Number, required: true },
        team: { type: String, required: true },
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        overs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
        runRate: { type: Number, default: 0 },
      },
    ],
  })
  innings?: Array<{
    number: number;
    team: string;
    runs: number;
    wickets: number;
    overs: number;
    balls: number;
    runRate: number;
  }>;

  @Prop({
    type: {
      currentOver: { type: Number },
      requiredRunRate: { type: Number },
      currentRunRate: { type: Number },
    },
  })
  liveData?: {
    currentOver: number;
    requiredRunRate?: number;
    currentRunRate?: number;
  };

  // Full batting scorecard (all players who have batted)
  @Prop({
    type: [
      {
        playerId: { type: String },
        playerName: { type: String, required: true },
        runs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
        fours: { type: Number, default: 0 },
        sixes: { type: Number, default: 0 },
        strikeRate: { type: Number, default: 0 },
        isOut: { type: Boolean, default: false },
        dismissedBy: { type: String },
        teamId: { type: String },
        teamName: { type: String, required: true },
        fowScore: { type: Number },
        fowBalls: { type: Number },
      },
    ],
  })
  batting?: Array<{
    playerId?: string;
    playerName: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    isOut: boolean;
    dismissedBy?: string;
    teamId?: string;
    teamName: string;
    fowScore?: number;
    fowBalls?: number;
  }>;

  // Full bowling scorecard (all bowlers)
  @Prop({
    type: [
      {
        playerId: { type: String },
        playerName: { type: String, required: true },
        overs: { type: Number, default: 0 },
        maidens: { type: Number, default: 0 },
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        economy: { type: Number, default: 0 },
        teamId: { type: String },
        teamName: { type: String, required: true },
      },
    ],
  })
  bowling?: Array<{
    playerId?: string;
    playerName: string;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    teamId?: string;
    teamName: string;
  }>;

  // Match state
  @Prop({ default: false })
  matchStarted: boolean;

  @Prop()
  tossWon?: string;

  @Prop()
  elected?: string;

  @Prop()
  target?: number;

  @Prop()
  round?: string;

  // API tracking
  @Prop({ required: true, default: Date.now, index: true })
  lastUpdatedAt: Date;

  @Prop({ default: 0 })
  updateCount: number;

  // TTL: Auto-delete live matches after 24 hours
  @Prop({ index: { expireAfterSeconds: 86400 }, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) })
  expiresAt: Date;
}

export const LiveMatchSchema = SchemaFactory.createForClass(LiveMatch);

// Indexes for performance
LiveMatchSchema.index({ startTime: 1, lastUpdatedAt: -1 });
LiveMatchSchema.index({ 'teams.home.id': 1, 'teams.away.id': 1 });
LiveMatchSchema.index({ series: 1, format: 1 });



