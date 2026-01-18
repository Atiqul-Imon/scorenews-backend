import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NewsArticleDocument = NewsArticle & Document;

export type ArticleType = 'breaking' | 'match_report' | 'analysis' | 'feature' | 'interview' | 'opinion';

@Schema({ timestamps: true, collection: 'news_articles' })
export class NewsArticle {
  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  title: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ trim: true, maxlength: 400 })
  summary?: string;

  @Prop({ required: true })
  body: string;

  @Prop({
    enum: ['breaking', 'match_report', 'analysis', 'feature', 'interview', 'opinion'],
    required: true,
    index: true,
  })
  type: ArticleType;

  @Prop({
    enum: ['cricket', 'football', 'general'],
    required: true,
    index: true,
  })
  category: string;

  @Prop({ type: [String], trim: true, lowercase: true, index: true })
  tags: string[];

  @Prop({ trim: true })
  heroImage?: string;

  @Prop({ type: [String], trim: true })
  gallery: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({
    type: {
      teamIds: [{ type: Types.ObjectId, ref: 'Team', index: true }],
      playerIds: [{ type: Types.ObjectId, ref: 'Player', index: true }],
      matchIds: [{ type: Types.ObjectId, ref: 'CricketMatch', index: true }],
      seriesIds: [{ type: Types.ObjectId, ref: 'Series', index: true }],
    },
  })
  entityRefs?: {
    teamIds?: Types.ObjectId[];
    playerIds?: Types.ObjectId[];
    matchIds?: Types.ObjectId[];
    seriesIds?: Types.ObjectId[];
  };

  @Prop({
    type: {
      title: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 300 },
      ogImage: { type: String, trim: true },
      twitterImage: { type: String, trim: true },
    },
  })
  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
    twitterImage?: string;
  };

  @Prop({
    enum: ['draft', 'in_review', 'scheduled', 'published', 'archived'],
    default: 'draft',
    index: true,
  })
  state: string;

  @Prop({ index: true, default: null })
  scheduledAt?: Date | null;

  @Prop({ index: true })
  publishedAt?: Date | null;

  @Prop({ trim: true })
  canonicalUrl?: string;

  @Prop({ default: 0, min: 0 })
  viewCount: number;

  @Prop({ default: 0, min: 0 })
  likes: number;

  @Prop({ default: 0, min: 0 })
  dislikes: number;

  @Prop({ default: 0, min: 0 })
  readingTimeMinutes: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'NewsRevision' }] })
  revisionIds: Types.ObjectId[];

  @Prop({ default: false, index: true })
  isDeleted: boolean;
}

export const NewsArticleSchema = SchemaFactory.createForClass(NewsArticle);

NewsArticleSchema.index({ state: 1, publishedAt: -1 });
NewsArticleSchema.index({ category: 1, type: 1, state: 1 });
NewsArticleSchema.index({ tags: 1, state: 1 });
NewsArticleSchema.index({ title: 'text', summary: 'text', body: 'text' });

// Pre-save hook to calculate reading time
NewsArticleSchema.pre('save', function (next) {
  if (this.isModified('body') || this.isNew) {
    const text = this.body.replace(/<[^>]*>/g, '');
    const wordCount = text.trim().split(/\s+/).length;
    this.readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  }
  next();
});




