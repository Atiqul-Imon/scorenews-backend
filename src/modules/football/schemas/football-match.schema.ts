import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FootballMatchDocument = FootballMatch & Document;

@Schema({ timestamps: true, collection: 'football_matches' })
export class FootballMatch {
  @Prop({ required: true, unique: true, index: true })
  matchId: string;

  @Prop({ required: true, index: true })
  league: string;

  @Prop({ required: true, index: true })
  season: string;

  @Prop({
    type: {
      home: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        logo: { type: String, required: true },
        shortName: { type: String, required: true },
      },
      away: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        logo: { type: String, required: true },
        shortName: { type: String, required: true },
      },
    },
    required: true,
  })
  teams: {
    home: { id: string; name: string; logo: string; shortName: string };
    away: { id: string; name: string; logo: string; shortName: string };
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
    enum: ['live', 'finished', 'scheduled', 'postponed', 'cancelled'],
    required: true,
    index: true,
  })
  status: string;

  @Prop({ required: true, index: true })
  startTime: Date;

  @Prop({ type: Date })
  endTime?: Date;

  @Prop({
    type: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 },
      halftime: {
        home: { type: Number },
        away: { type: Number },
      },
      fulltime: {
        home: { type: Number },
        away: { type: Number },
      },
      extraTime: {
        home: { type: Number },
        away: { type: Number },
      },
      penalties: {
        home: { type: Number },
        away: { type: Number },
      },
    },
  })
  score: {
    home: number;
    away: number;
    halftime?: { home: number; away: number };
    fulltime?: { home: number; away: number };
    extraTime?: { home: number; away: number };
    penalties?: { home: number; away: number };
  };

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        type: {
          type: String,
          enum: ['goal', 'yellow_card', 'red_card', 'substitution', 'penalty', 'own_goal'],
          required: true,
        },
        player: { type: String, required: true },
        team: { type: String, required: true },
        minute: { type: Number, required: true },
        description: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  })
  events?: Array<{
    id: string;
    type: string;
    player: string;
    team: string;
    minute: number;
    description: string;
    timestamp: Date;
  }>;

  @Prop({
    type: {
      possession: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      shots: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      shotsOnTarget: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      corners: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      fouls: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      yellowCards: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
      redCards: {
        home: { type: Number, default: 0 },
        away: { type: Number, default: 0 },
      },
    },
  })
  statistics?: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    fouls: { home: number; away: number };
    yellowCards: { home: number; away: number };
    redCards: { home: number; away: number };
  };
}

export const FootballMatchSchema = SchemaFactory.createForClass(FootballMatch);

FootballMatchSchema.index({ startTime: 1, status: 1 });
FootballMatchSchema.index({ 'teams.home.id': 1, 'teams.away.id': 1 });
FootballMatchSchema.index({ league: 1, season: 1 });
FootballMatchSchema.index({ status: 1, startTime: 1 });




