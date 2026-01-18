import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsArticle, NewsArticleSchema } from './schemas/news-article.schema';
import { NewsRevision, NewsRevisionSchema } from './schemas/news-revision.schema';
import { ElasticsearchModule } from '../../elasticsearch/elasticsearch.module';
import { RedisModule } from '../../redis/redis.module';
import { LoggerModule } from '../../common/logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NewsArticle.name, schema: NewsArticleSchema },
      { name: NewsRevision.name, schema: NewsRevisionSchema },
    ]),
    ElasticsearchModule,
    RedisModule,
    LoggerModule,
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}

