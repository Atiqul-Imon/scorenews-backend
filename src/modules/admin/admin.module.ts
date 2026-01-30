import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { NewsArticle, NewsArticleSchema } from '../news/schemas/news-article.schema';
import { Thread, ThreadSchema } from '../threads/schemas/thread.schema';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { CricketMatch, CricketMatchSchema } from '../cricket/schemas/cricket-match.schema';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Content.name, schema: ContentSchema },
      { name: NewsArticle.name, schema: NewsArticleSchema },
      { name: Thread.name, schema: ThreadSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: CricketMatch.name, schema: CricketMatchSchema },
    ]),
    LoggerModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

