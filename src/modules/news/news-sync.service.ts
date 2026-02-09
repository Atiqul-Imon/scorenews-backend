import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsArticle, NewsArticleDocument } from './schemas/news-article.schema';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

/**
 * Service to sync view counts from Redis to MongoDB periodically
 * This reduces MongoDB writes significantly by batching updates
 */
@Injectable()
export class NewsSyncService {
  constructor(
    @InjectModel(NewsArticle.name) private newsArticleModel: Model<NewsArticleDocument>,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Sync view counts from Redis to MongoDB
   * Runs every 5 minutes to batch update view counts
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncViewCounts(): Promise<void> {
    try {
      this.logger.log('Starting view count sync from Redis to MongoDB', 'NewsSyncService');

      // Get all view count keys from Redis
      const viewKeys = await this.redisService.scanKeys('news:views:*');
      
      if (viewKeys.length === 0) {
        this.logger.log('No view counts to sync', 'NewsSyncService');
        return;
      }

      const redisClient = this.redisService.getClient();
      const updates: Array<{ articleId: string; viewCount: number }> = [];

      // Get all view counts from Redis (using pipeline for better performance)
      const pipeline = redisClient.pipeline();
      for (const key of viewKeys) {
        pipeline.get(key);
      }
      const results = await pipeline.exec();

      // Process results
      for (let i = 0; i < viewKeys.length; i++) {
        try {
          const key = viewKeys[i];
          const result = results?.[i];
          if (result && result[1] !== null) {
            const articleId = key.replace('news:views:', '');
            const viewCount = parseInt(result[1] as string, 10);
            if (viewCount > 0) {
              updates.push({ articleId, viewCount });
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to process view count for key ${viewKeys[i]}`, error, 'NewsSyncService');
        }
      }

      if (updates.length === 0) {
        this.logger.log('No valid view counts to sync', 'NewsSyncService');
        return;
      }

      // Batch update MongoDB
      const bulkOps = updates.map(({ articleId, viewCount }) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(articleId) },
          update: { $set: { viewCount } },
        },
      }));

      const result = await this.newsArticleModel.bulkWrite(bulkOps, { ordered: false });
      
      this.logger.log(
        `Synced ${result.modifiedCount} view counts from Redis to MongoDB`,
        'NewsSyncService',
      );

      // Clear synced keys from Redis (optional - or let them expire)
      // await Promise.all(viewKeys.map((key) => this.redisService.del(key)));
    } catch (error) {
      this.logger.error('Failed to sync view counts', error, 'NewsSyncService');
    }
  }
}

