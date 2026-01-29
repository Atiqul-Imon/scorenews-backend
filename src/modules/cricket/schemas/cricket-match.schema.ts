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

  // Additional match details
  @Prop()
  name?: string;

  @Prop()
  matchNote?: string;

  @Prop()
  round?: string;

  @Prop()
  tossWon?: string;

  @Prop()
  elected?: string;

  @Prop()
  target?: number;

  @Prop()
  endingAt?: Date;

  // Additional API fields for completed matches
  @Prop()
  apiNote?: string; // Raw result note from API

  @Prop()
  tossWonTeamId?: string; // Team ID that won the toss

  @Prop()
  manOfMatchId?: string; // Player ID for Man of the Match

  @Prop()
  manOfSeriesId?: string; // Player ID for Man of the Series

  @Prop()
  totalOversPlayed?: number; // Total overs played in the match

  @Prop({ default: false })
  superOver?: boolean; // Super over indicator

  @Prop({ default: false })
  followOn?: boolean; // Follow-on indicator

  @Prop({ default: false })
  drawNoResult?: boolean; // Draw/no result indicator

  // Data source tracking
  @Prop({ enum: ['api', 'calculated'], default: 'calculated' })
  dataSource?: 'api' | 'calculated'; // Source of result data

  @Prop()
  apiFetchedAt?: Date; // Timestamp when data was fetched from API

  @Prop({ default: false })
  isCompleteData?: boolean; // Flag indicating if all API data is saved

  // Current batters and bowlers for live matches
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

  // Full batting and bowling statistics
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

  // Match metadata
  @Prop({ default: false })
  matchStarted?: boolean;

  @Prop({ default: false })
  matchEnded?: boolean;

  @Prop({
    type: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 },
    },
    required: false,
  })
  score?: {
    home: number;
    away: number;
  };

  // Match result information (calculated when match is completed)
  @Prop({
    type: {
      winner: { type: String }, // 'home' or 'away'
      winnerName: { type: String },
      margin: { type: Number }, // Margin value (runs or wickets)
      marginType: { type: String, enum: ['runs', 'wickets'] }, // Type of margin
      resultText: { type: String }, // Full result text like "New Zealand won by 50 runs"
    },
    required: false,
  })
  result?: {
    winner: 'home' | 'away';
    winnerName: string;
    margin: number;
    marginType: 'runs' | 'wickets';
    resultText: string;
  };
}

export const CricketMatchSchema = SchemaFactory.createForClass(CricketMatch);

// Indexes
CricketMatchSchema.index({ startTime: 1, status: 1 });
CricketMatchSchema.index({ 'teams.home.id': 1, 'teams.away.id': 1 });
CricketMatchSchema.index({ series: 1, format: 1 });
CricketMatchSchema.index({ status: 1, startTime: 1 });





