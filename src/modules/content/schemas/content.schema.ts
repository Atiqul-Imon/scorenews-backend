import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContentDocument = Content & Document;

@Schema({ timestamps: true, collection: 'content' })
export class Content {
  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  title: string;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({
    enum: ['video', 'audio', 'article'],
    required: true,
    index: true,
  })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  contributor: Types.ObjectId;

  @Prop({
    enum: ['cricket', 'football', 'general'],
    required: true,
    index: true,
  })
  category: string;

  @Prop({ type: [String], trim: true, lowercase: true })
  tags: string[];

  @Prop({ trim: true })
  mediaUrl?: string;

  @Prop({ trim: true })
  thumbnailUrl?: string;

  @Prop({ min: 0 })
  duration?: number;

  @Prop({
    enum: ['pending', 'approved', 'rejected', 'draft'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop({ default: false, index: true })
  featured: boolean;

  @Prop({ default: 0, min: 0 })
  views: number;

  @Prop({ default: 0, min: 0 })
  likes: number;

  @Prop({ default: 0, min: 0 })
  dislikes: number;

  @Prop({
    type: [
      {
        user: { type: Types.ObjectId, ref: 'User', required: true },
        content: { type: String, required: true, trim: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
        likes: { type: Number, default: 0, min: 0 },
      },
    ],
  })
  comments: Array<{
    user: Types.ObjectId;
    content: string;
    createdAt: Date;
    likes: number;
  }>;

  @Prop({ index: true })
  publishedAt?: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);

ContentSchema.index({ status: 1, publishedAt: -1 });
ContentSchema.index({ category: 1, type: 1, status: 1 });
ContentSchema.index({ contributor: 1, status: 1 });
ContentSchema.index({ tags: 1 });
ContentSchema.index({ featured: 1, status: 1, publishedAt: -1 });
ContentSchema.index({ title: 'text', content: 'text' });




