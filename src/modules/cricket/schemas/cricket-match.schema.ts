import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CricketMatchDocument = CricketMatch & Document;

@Schema({ timestamps: true, collection: 'cricket_matches' })
export class CricketMatch {
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
    enum: ['live', 'completed', 'upcoming', 'cancelled'],
    required: true,
    index: true,
  })
  status: string;

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

  @Prop({
    type: {
      currentOver: { type: Number },
      currentBatsman: { type: String },
      currentBowler: { type: String },
      lastBall: { type: String },
      requiredRunRate: { type: Number },
      currentRunRate: { type: Number },
    },
  })
  liveData?: {
    currentOver: number;
    currentBatsman: string;
    currentBowler: string;
    lastBall: string;
    requiredRunRate?: number;
    currentRunRate?: number;
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
    type: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        team: { type: String, required: true },
        role: {
          type: String,
          enum: ['batsman', 'bowler', 'all-rounder', 'wicket-keeper'],
          required: true,
        },
        runs: { type: Number, default: 0 },
        balls: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        overs: { type: Number, default: 0 },
        economy: { type: Number, default: 0 },
      },
    ],
  })
  players?: Array<{
    id: string;
    name: string;
    team: string;
    role: string;
    runs?: number;
    balls?: number;
    wickets?: number;
    overs?: number;
    economy?: number;
  }>;
}

export const CricketMatchSchema = SchemaFactory.createForClass(CricketMatch);

// Indexes
CricketMatchSchema.index({ startTime: 1, status: 1 });
CricketMatchSchema.index({ 'teams.home.id': 1, 'teams.away.id': 1 });
CricketMatchSchema.index({ series: 1, format: 1 });
CricketMatchSchema.index({ status: 1, startTime: 1 });





