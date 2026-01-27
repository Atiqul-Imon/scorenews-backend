import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ThreadDocument = Thread & Document;

@Schema({ timestamps: true, collection: 'threads' })
export class Thread {
  @Prop({ required: true, trim: true, maxlength: 300, index: true })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 40000 })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({
    enum: ['cricket', 'football', 'general', 'news', 'discussion'],
    required: true,
    index: true,
  })
  category: string;

  @Prop({ type: [String], trim: true, lowercase: true, maxlength: 50 })
  tags: string[];

  @Prop({ trim: true, maxlength: 100 })
  flair?: string;

  @Prop({ default: false, index: true })
  isLocked: boolean;

  @Prop({ default: false, index: true })
  isPinned: boolean;

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop({ default: 0, min: 0 })
  upvotes: number;

  @Prop({ default: 0, min: 0 })
  downvotes: number;

  @Prop({ default: 0, index: true })
  score: number;

  @Prop({ default: 0, min: 0 })
  views: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }] })
  comments: Types.ObjectId[];

  @Prop({ default: 0, min: 0 })
  commentCount: number;

  @Prop({ default: Date.now, index: true })
  lastActivity: Date;

  @Prop()
  editedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  editedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 200 })
  editReason?: string;

  @Prop({
    type: {
      type: { type: String, enum: ['image', 'video', 'link'] },
      url: { type: String, trim: true },
      thumbnail: { type: String, trim: true },
      title: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 500 },
    },
  })
  media?: {
    type: string;
    url: string;
    thumbnail?: string;
    title?: string;
    description?: string;
  };

  @Prop({
    type: {
      question: { type: String, trim: true, maxlength: 300 },
      options: [
        {
          text: { type: String, required: true, trim: true, maxlength: 200 },
          votes: { type: Number, default: 0, min: 0 },
        },
      ],
      expiresAt: { type: Date },
      allowMultiple: { type: Boolean, default: false },
      totalVotes: { type: Number, default: 0, min: 0 },
    },
  })
  poll?: {
    question: string;
    options: Array<{ text: string; votes: number }>;
    expiresAt: Date;
    allowMultiple: boolean;
    totalVotes: number;
  };

  @Prop({
    type: [
      {
        type: { type: String, required: true, trim: true },
        count: { type: Number, required: true, min: 1 },
        givenBy: { type: Types.ObjectId, ref: 'User', required: true },
        givenAt: { type: Date, default: Date.now },
      },
    ],
  })
  awards: Array<{
    type: string;
    count: number;
    givenBy: Types.ObjectId;
    givenAt: Date;
  }>;

  @Prop({
    type: [
      {
        reportedBy: { type: Types.ObjectId, ref: 'User', required: true },
        reason: {
          type: String,
          required: true,
          enum: ['spam', 'harassment', 'hate_speech', 'misinformation', 'violence', 'other'],
        },
        reportedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['pending', 'resolved', 'dismissed'],
          default: 'pending',
        },
      },
    ],
  })
  reports: Array<{
    reportedBy: Types.ObjectId;
    reason: string;
    reportedAt: Date;
    status: string;
  }>;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  moderators: Types.ObjectId[];
}

export const ThreadSchema = SchemaFactory.createForClass(Thread);

ThreadSchema.index({ category: 1, score: -1, createdAt: -1 });
ThreadSchema.index({ author: 1, createdAt: -1 });
ThreadSchema.index({ tags: 1 });
ThreadSchema.index({ isPinned: -1, score: -1, createdAt: -1 });
ThreadSchema.index({ lastActivity: -1 });
ThreadSchema.index({ isDeleted: 1, isLocked: 1 });

// Pre-save hook to update score
ThreadSchema.pre('save', function (next) {
  this.score = this.upvotes - this.downvotes;
  next();
});

// Pre-save hook to update lastActivity
ThreadSchema.pre('save', function (next) {
  if (this.isModified('comments') || this.isModified('upvotes') || this.isModified('downvotes')) {
    this.lastActivity = new Date();
  }
  next();
});





