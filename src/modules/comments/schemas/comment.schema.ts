import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ required: true, trim: true, maxlength: 10000 })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Thread', index: true })
  thread?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'NewsArticle', index: true })
  article?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', index: true })
  parentComment?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }] })
  replies: Types.ObjectId[];

  @Prop({ default: 0, min: 0 })
  upvotes: number;

  @Prop({ default: 0, min: 0 })
  downvotes: number;

  @Prop({ default: 0, index: true })
  score: number;

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop()
  editedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  editedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 200 })
  editReason?: string;

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

  @Prop({ default: 0, max: 10, index: true })
  depth: number;

  @Prop({ index: true })
  path: string;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ thread: 1, score: -1, createdAt: -1 });
CommentSchema.index({ article: 1, score: -1, createdAt: -1 });
CommentSchema.index({ author: 1, createdAt: -1 });
CommentSchema.index({ parentComment: 1, createdAt: 1 });
CommentSchema.index({ path: 1 });
CommentSchema.index({ isDeleted: 1 });

// Validation: either thread or article must be present
CommentSchema.pre('validate', function (next) {
  if (!this.thread && !this.article) {
    return next(new Error('Either thread or article must be specified'));
  }
  next();
});

// Pre-save hook to update score
CommentSchema.pre('save', function (next) {
  this.score = this.upvotes - this.downvotes;
  next();
});

// Pre-save hook to set path for nested comments
CommentSchema.pre('save', async function (next) {
  if (this.parentComment) {
    const CommentModel = this.constructor as any;
    const parent = await CommentModel.findById(this.parentComment);
    if (parent) {
      this.path = parent.path ? `${parent.path}.${this._id}` : this._id.toString();
      this.depth = parent.depth + 1;
    } else {
      this.path = this._id.toString();
      this.depth = 0;
    }
  } else {
    this.path = this._id.toString();
    this.depth = 0;
  }
  next();
});

