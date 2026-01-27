import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CricketTeamDocument = CricketTeam & Document;

@Schema({ timestamps: true, collection: 'cricket_teams' })
export class CricketTeam {
  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  shortName: string;

  @Prop({ required: true, unique: true, index: true })
  matchKey: string;

  @Prop({ required: true })
  flag: string;

  @Prop()
  crest?: string;

  @Prop()
  heroImage?: string;

  @Prop({ maxlength: 600 })
  summary?: string;

  @Prop()
  board?: string;

  @Prop()
  coach?: string;

  @Prop({
    type: {
      test: { type: String },
      odi: { type: String },
      t20: { type: String },
    },
  })
  captains?: {
    test?: string;
    odi?: string;
    t20?: string;
  };

  @Prop({
    type: {
      test: { type: Number, min: 1 },
      odi: { type: Number, min: 1 },
      t20: { type: Number, min: 1 },
    },
  })
  ranking?: {
    test?: number;
    odi?: number;
    t20?: number;
  };

  @Prop({ min: 1800, max: 2100 })
  firstTestYear?: number;

  @Prop({
    type: {
      primary: { type: String },
      secondary: { type: String },
      accent: { type: String },
    },
  })
  colors?: {
    primary: string;
    secondary: string;
    accent?: string;
  };

  @Prop({
    type: {
      rating: { type: Number, min: 0, max: 5 },
      votes: { type: Number, min: 0 },
    },
  })
  fanPulse?: {
    rating: number;
    votes: number;
  };

  @Prop({
    type: [
      {
        name: { type: String },
        year: { type: Number, min: 1800, max: 2100 },
        result: { type: String },
      },
    ],
  })
  iccTitles?: Array<{
    name: string;
    year: number;
    result?: string;
  }>;

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        role: { type: String, required: true },
        image: { type: String },
        spotlight: { type: String },
        stats: {
          matches: { type: Number, min: 0 },
          runs: { type: Number, min: 0 },
          wickets: { type: Number, min: 0 },
          average: { type: Number, min: 0 },
          strikeRate: { type: Number, min: 0 },
        },
      },
    ],
  })
  keyPlayers?: Array<{
    name: string;
    role: string;
    image?: string;
    spotlight?: string;
    stats?: {
      matches?: number;
      runs?: number;
      wickets?: number;
      average?: number;
      strikeRate?: number;
    };
  }>;

  @Prop({
    type: {
      batting: [
        {
          name: { type: String, required: true },
          runs: { type: Number, min: 0 },
          innings: { type: Number, min: 0 },
          average: { type: Number, min: 0 },
          strikeRate: { type: Number, min: 0 },
          description: { type: String },
        },
      ],
      bowling: [
        {
          name: { type: String, required: true },
          wickets: { type: Number, min: 0 },
          innings: { type: Number, min: 0 },
          average: { type: Number, min: 0 },
          economy: { type: Number, min: 0 },
          description: { type: String },
        },
      ],
    },
  })
  statLeaders?: {
    batting?: Array<{
      name: string;
      runs?: number;
      innings?: number;
      average?: number;
      strikeRate?: number;
      description?: string;
    }>;
    bowling?: Array<{
      name: string;
      wickets?: number;
      innings?: number;
      average?: number;
      economy?: number;
      description?: string;
    }>;
  };

  @Prop({
    type: [
      {
        label: { type: String, required: true },
        format: { type: String },
        url: { type: String },
      },
    ],
  })
  recordLinks?: Array<{
    label: string;
    format?: string;
    url?: string;
  }>;

  @Prop({
    type: [
      {
        year: { type: Number, min: 1800, max: 2100 },
        title: { type: String, required: true },
        description: { type: String },
      },
    ],
  })
  timeline?: Array<{
    year: number;
    title: string;
    description?: string;
  }>;

  @Prop({ type: [String], lowercase: true })
  newsTags?: string[];
}

export const CricketTeamSchema = SchemaFactory.createForClass(CricketTeam);

CricketTeamSchema.index({ slug: 1 });
CricketTeamSchema.index({ matchKey: 1 });





