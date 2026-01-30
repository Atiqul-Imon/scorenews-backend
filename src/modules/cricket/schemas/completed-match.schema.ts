import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompletedMatchDocument = CompletedMatch & Document;

@Schema({ timestamps: true, collection: 'cricket_completed_matches' })
export class CompletedMatch {
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

  @Prop({ required: true, index: true })
  endTime: Date;

  // COMPLETED-SPECIFIC FIELDS
  @Prop({
    type: {
      home: {
        runs: { type: Number, required: true },
        wickets: { type: Number, required: true },
        overs: { type: Number, required: true },
      },
      away: {
        runs: { type: Number, required: true },
        wickets: { type: Number, required: true },
        overs: { type: Number, required: true },
      },
    },
    required: true,
  })
  finalScore: {
    home: { runs: number; wickets: number; overs: number };
    away: { runs: number; wickets: number; overs: number };
  };

  // Frontend compatibility: map finalScore to currentScore
  // This is a virtual field that will be added during transformation
  currentScore?: {
    home: { runs: number; wickets: number; overs: number; balls: number };
    away: { runs: number; wickets: number; overs: number; balls: number };
  };

  @Prop({
    type: {
      winner: { type: String, enum: ['home', 'away', 'draw'], required: true },
      winnerName: { type: String, required: true },
      margin: { type: Number, required: true },
      marginType: { type: String, enum: ['runs', 'wickets'], required: true },
      resultText: { type: String, required: true },
      dataSource: { type: String, enum: ['api', 'calculated'], required: true },
    },
    required: true,
  })
  result: {
    winner: 'home' | 'away' | 'draw';
    winnerName: string;
    margin: number;
    marginType: 'runs' | 'wickets';
    resultText: string;
    dataSource: 'api' | 'calculated';
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

  // Match details
  @Prop()
  matchNote?: string;

  @Prop()
  apiNote?: string;

  @Prop()
  round?: string;

  @Prop()
  tossWon?: string;

  @Prop()
  elected?: string;

  @Prop()
  manOfMatchId?: string;

  @Prop()
  manOfSeriesId?: string;

  @Prop()
  totalOversPlayed?: number;

  @Prop({ default: false })
  superOver?: boolean;

  @Prop({ default: false })
  followOn?: boolean;

  @Prop({ default: false })
  drawNoResult?: boolean;

  // Data quality
  @Prop({ required: true, default: 'api', enum: ['api', 'calculated'] })
  dataSource: 'api' | 'calculated';

  @Prop({ required: true, default: Date.now })
  apiFetchedAt: Date;

  @Prop({ default: true })
  isCompleteData: boolean;
}

export const CompletedMatchSchema = SchemaFactory.createForClass(CompletedMatch);

// Indexes for performance
CompletedMatchSchema.index({ endTime: -1, startTime: -1 });
CompletedMatchSchema.index({ 'teams.home.id': 1, 'teams.away.id': 1 });
CompletedMatchSchema.index({ series: 1, format: 1 });
CompletedMatchSchema.index({ 'result.winner': 1 });


