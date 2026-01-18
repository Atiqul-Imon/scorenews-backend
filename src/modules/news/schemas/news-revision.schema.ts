import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type NewsRevisionDocument = NewsRevision & Document;

@Schema({ timestamps: true, collection: 'news_revisions' })
export class NewsRevision {
  @Prop({ type: Types.ObjectId, ref: 'NewsArticle', required: true, index: true })
  articleId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot: any;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  editorId: Types.ObjectId;

  @Prop({ trim: true, maxlength: 200 })
  note?: string;
}

export const NewsRevisionSchema = SchemaFactory.createForClass(NewsRevision);

