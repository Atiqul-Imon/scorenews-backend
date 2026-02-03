import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MatchCommentaryDocument = MatchCommentary & Document;

@Schema({ timestamps: true, collection: 'match_commentary' })
export class MatchCommentary {
  @Prop({ required: true, index: true })
  matchId: string;

  @Prop({ required: true, min: 1, max: 2, index: true })
  innings: number;

  @Prop({ required: true, min: 0, index: true })
  over: number;

  @Prop({ required: false, min: 0, max: 5 })
  ball: number | null; // null for pre/post commentary

  @Prop({
    required: true,
    enum: ['pre-ball', 'ball', 'post-ball'],
    index: true,
  })
  commentaryType: 'pre-ball' | 'ball' | 'post-ball';

  @Prop({ required: true, maxlength: 1000 })
  commentary: string;

  @Prop({ required: true, index: true })
  authorId: string;

  @Prop({ required: true })
  authorName: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: 0, min: 0 })
  order: number; // For ordering multiple post-ball commentaries
}

export const MatchCommentarySchema = SchemaFactory.createForClass(MatchCommentary);

// Compound indexes for efficient queries
MatchCommentarySchema.index({ matchId: 1, innings: 1, over: 1, ball: 1, commentaryType: 1, order: 1 });
MatchCommentarySchema.index({ matchId: 1, timestamp: -1 });
MatchCommentarySchema.index({ authorId: 1 });
MatchCommentarySchema.index({ matchId: 1, isActive: 1 });

