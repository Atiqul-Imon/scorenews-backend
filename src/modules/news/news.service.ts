import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewsArticle, NewsArticleDocument } from './schemas/news-article.schema';
import { NewsRevision, NewsRevisionDocument } from './schemas/news-revision.schema';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { RedisService } from '../../redis/redis.service';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildSlug(date: Date, rawSlug: string): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `news/${yyyy}/${mm}/${rawSlug}`;
}

@Injectable()
export class NewsService {
  // Cache TTL constants (in seconds)
  private readonly CACHE_TTL = {
    ARTICLE: 3600, // 1 hour for individual articles (static content)
    ARTICLE_LIST: 300, // 5 minutes for article lists (more dynamic)
    TRENDING: 300, // 5 minutes for trending articles
    VIEW_COUNT_BATCH: 60, // 1 minute for view count batching
  };

  constructor(
    @InjectModel(NewsArticle.name) private newsArticleModel: Model<NewsArticleDocument>,
    @InjectModel(NewsRevision.name) private newsRevisionModel: Model<NewsRevisionDocument>,
    private elasticsearchService: ElasticsearchService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {}

  /**
   * Generate cache key for article list
   */
  private getArticlesCacheKey(filters: any): string {
    const { page = 1, limit = 20, state = 'published', category, type, search } = filters;
    const filterKey = JSON.stringify({ state, category, type, search, page, limit });
    return `news:articles:${Buffer.from(filterKey).toString('base64')}`;
  }

  /**
   * Generate cache key for individual article
   */
  private getArticleCacheKey(identifier: string, type: 'slug' | 'id' = 'slug'): string {
    return `news:article:${type}:${identifier}`;
  }

  /**
   * Invalidate all article-related caches
   * Uses SCAN instead of KEYS for better performance in production
   */
  private async invalidateArticleCaches(articleId?: string, slug?: string): Promise<void> {
    try {
      // Invalidate specific article cache
      if (articleId) {
        await this.redisService.del(this.getArticleCacheKey(articleId, 'id'));
      }
      if (slug) {
        await this.redisService.del(this.getArticleCacheKey(slug, 'slug'));
      }

      // Invalidate list caches (use SCAN for better performance)
      try {
        const listKeys = await this.redisService.scanKeys('news:articles:*');
        if (listKeys.length > 0) {
          await this.redisService.delMultiple(listKeys);
        }
      } catch (error) {
        // Fallback to KEYS if SCAN is not available
        const listKeys = await this.redisService.keys('news:articles:*');
        if (listKeys.length > 0) {
          await Promise.all(listKeys.map((key) => this.redisService.del(key)));
        }
      }

      // Invalidate trending cache
      try {
        const trendingKeys = await this.redisService.scanKeys('trending_news:*');
        if (trendingKeys.length > 0) {
          await this.redisService.delMultiple(trendingKeys);
        }
      } catch (error) {
        // Fallback to KEYS if SCAN is not available
        const trendingKeys = await this.redisService.keys('trending_news:*');
        if (trendingKeys.length > 0) {
          await Promise.all(trendingKeys.map((key) => this.redisService.del(key)));
        }
      }
    } catch (error) {
      this.logger.warn('Failed to invalidate article caches', error, 'NewsService');
    }
  }

  /**
   * Increment view count using Redis (batched updates to reduce MongoDB writes)
   * Uses Redis INCR for atomic increments, MongoDB updates happen periodically via NewsSyncService
   * This reduces MongoDB writes by ~90% (only syncs every 5 minutes instead of every view)
   */
  private async incrementViewCount(articleId: string, slug: string): Promise<void> {
    try {
      const viewKey = `news:views:${articleId}`;
      const redisClient = this.redisService.getClient();
      
      // Use Redis INCR for atomic increments (more efficient than get+set)
      const newCount = await redisClient.incr(viewKey);
      
      // Set TTL on first increment (when count is 1) - 10 minutes TTL
      if (newCount === 1) {
        await redisClient.expire(viewKey, 600); // 10 minutes
      }

      // MongoDB updates are handled by NewsSyncService cron job (every 5 minutes)
      // This reduces MongoDB writes significantly - from every view to every 5 minutes
    } catch (error) {
      this.logger.warn('Failed to increment view count in Redis', error, 'NewsService');
      // Fallback to direct MongoDB update only if Redis fails
      // This ensures data consistency but should be rare
      try {
        await this.newsArticleModel.updateOne({ slug }, { $inc: { viewCount: 1 } });
      } catch (mongoError) {
        this.logger.error('Failed to increment view count in MongoDB', mongoError, 'NewsService');
      }
    }
  }

  async createArticle(data: any, authorId: string) {
    const { title, summary, body, type, category, tags = [], heroImage, gallery = [], entityRefs, seo } = data;

    if (!title || !body || !type || !category) {
      throw new BadRequestException('Missing required fields: title, body, type, and category are required');
    }

    const baseSlug = slugify(title);
    const datedSlug = buildSlug(new Date(), baseSlug);

    const article = await this.newsArticleModel.create({
      title,
      slug: datedSlug,
      summary,
      body,
      type,
      category,
      tags,
      heroImage,
      gallery: gallery || [],
      author: authorId,
      entityRefs,
      seo,
      state: 'published',
      scheduledAt: null,
      publishedAt: new Date(),
    });

    await this.newsRevisionModel.create({
      articleId: article._id,
      snapshot: article.toObject(),
      editorId: authorId,
      note: 'create',
    });

    // Index in Elasticsearch
    try {
      await this.elasticsearchService.indexDocument('news_articles', article._id.toString(), {
        id: article._id.toString(),
        title: article.title,
        summary: article.summary,
        body: article.body,
        slug: article.slug,
        type: article.type,
        category: article.category,
        tags: article.tags,
        publishedAt: article.publishedAt,
      });
    } catch (error) {
      this.logger.warn('Failed to index news article in ES', error, 'NewsService');
    }

    // Invalidate caches after creating new article
    await this.invalidateArticleCaches(article._id.toString(), article.slug);

    return article;
  }

  async getArticles(filters: any) {
    // Generate cache key based on filters
    const cacheKey = this.getArticlesCacheKey(filters);
    
    // Try to get from cache first
    try {
      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (error) {
      this.logger.warn('Failed to get articles from cache', error, 'NewsService');
    }

    // Cache miss - fetch from MongoDB
    const { page = 1, limit = 20, state = 'published', category, type, search } = filters;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (state) filter.state = state;
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { summary: new RegExp(search, 'i') },
        { body: new RegExp(search, 'i') },
      ];
    }

    // Use Promise.all for parallel queries
    const [articles, total] = await Promise.all([
      this.newsArticleModel
        .find(filter)
        .populate('author', 'name email avatar')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.newsArticleModel.countDocuments(filter),
    ]);

    const result = {
      items: articles,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };

    // Cache the result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(result), this.CACHE_TTL.ARTICLE_LIST);
    } catch (error) {
      this.logger.warn('Failed to cache articles', error, 'NewsService');
    }

    return result;
  }

  async getArticleBySlug(slug: string) {
    const cacheKey = this.getArticleCacheKey(slug, 'slug');

    // Try to get from cache first
    try {
      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        const cachedArticle = JSON.parse(cachedData);
        // Increment view count asynchronously (don't block response)
        this.incrementViewCount(cachedArticle._id.toString(), slug).catch((error) => {
          this.logger.warn('Failed to increment view count', error, 'NewsService');
        });
        return {
          success: true,
          data: cachedArticle,
        };
      }
    } catch (error) {
      this.logger.warn('Failed to get article from cache', error, 'NewsService');
    }

    // Cache miss - fetch from MongoDB
    const article = await this.newsArticleModel
      .findOne({ slug, isDeleted: false })
      .populate('author', 'name email avatar')
      .lean();

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Only return published articles (unless accessing through admin)
    if (article.state !== 'published') {
      throw new NotFoundException('Article not found');
    }

    // Increment views asynchronously
    this.incrementViewCount(article._id.toString(), slug).catch((error) => {
      this.logger.warn('Failed to increment view count', error, 'NewsService');
    });

    // Cache the article
    try {
      await this.redisService.set(cacheKey, JSON.stringify(article), this.CACHE_TTL.ARTICLE);
    } catch (error) {
      this.logger.warn('Failed to cache article', error, 'NewsService');
    }

    return {
      success: true,
      data: article,
    };
  }

  async getArticleById(id: string) {
    const cacheKey = this.getArticleCacheKey(id, 'id');

    // Try to get from cache first
    try {
      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        const cachedArticle = JSON.parse(cachedData);
        // Increment view count asynchronously
        this.incrementViewCount(id, cachedArticle.slug).catch((error) => {
          this.logger.warn('Failed to increment view count', error, 'NewsService');
        });
        return cachedArticle;
      }
    } catch (error) {
      this.logger.warn('Failed to get article from cache', error, 'NewsService');
    }

    // Cache miss - fetch from MongoDB
    const article = await this.newsArticleModel
      .findById(id)
      .populate('author', 'name email avatar')
      .lean();

    if (!article || article.isDeleted) {
      throw new NotFoundException('Article not found');
    }

    // Increment views asynchronously
    this.incrementViewCount(id, article.slug).catch((error) => {
      this.logger.warn('Failed to increment view count', error, 'NewsService');
    });

    // Cache the article
    try {
      await this.redisService.set(cacheKey, JSON.stringify(article), this.CACHE_TTL.ARTICLE);
      // Also cache by slug for faster lookups
      if (article.slug) {
        await this.redisService.set(
          this.getArticleCacheKey(article.slug, 'slug'),
          JSON.stringify(article),
          this.CACHE_TTL.ARTICLE,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to cache article', error, 'NewsService');
    }

    return article;
  }

  async getTrending(limit: number = 4) {
    const cacheKey = `trending_news:${limit}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const articles = await this.newsArticleModel
      .find({ state: 'published', isDeleted: false })
      .populate('author', 'name email avatar')
      .sort({ viewCount: -1, likes: -1, publishedAt: -1 })
      .limit(limit)
      .lean();

    await this.redisService.set(cacheKey, JSON.stringify(articles), this.CACHE_TTL.TRENDING);
    return articles;
  }

  async updateArticle(id: string, data: any, editorId: string) {
    const updatable = [
      'title',
      'summary',
      'body',
      'type',
      'category',
      'tags',
      'heroImage',
      'gallery',
      'entityRefs',
      'seo',
      'canonicalUrl',
      'scheduledAt',
    ];
    const update: any = {};
    for (const key of updatable) {
      if (key in data) update[key] = data[key];
    }

    if (update.title) {
      const baseSlug = slugify(update.title);
      update.slug = buildSlug(new Date(), baseSlug);
    }

    const article = await this.newsArticleModel.findByIdAndUpdate(id, update, { new: true });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    await this.newsRevisionModel.create({
      articleId: article._id,
      snapshot: article.toObject(),
      editorId,
      note: 'update',
    });

    // Invalidate caches after update
    await this.invalidateArticleCaches(article._id.toString(), article.slug);

    return article;
  }

  async publishArticle(id: string) {
    const article = await this.newsArticleModel.findByIdAndUpdate(
      id,
      { state: 'published', publishedAt: new Date(), scheduledAt: null },
      { new: true },
    );

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Index in Elasticsearch
    try {
      await this.elasticsearchService.indexDocument('news_articles', article._id.toString(), {
        id: article._id.toString(),
        title: article.title,
        summary: article.summary,
        body: article.body,
        slug: article.slug,
        type: article.type,
        category: article.category,
        tags: article.tags,
        publishedAt: article.publishedAt,
      });
    } catch (error) {
      this.logger.warn('Failed to index news article in ES', error, 'NewsService');
    }

    // Invalidate caches after publishing
    await this.invalidateArticleCaches(article._id.toString(), article.slug);

    return article;
  }
}
