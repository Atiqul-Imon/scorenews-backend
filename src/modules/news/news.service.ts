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
  constructor(
    @InjectModel(NewsArticle.name) private newsArticleModel: Model<NewsArticleDocument>,
    @InjectModel(NewsRevision.name) private newsRevisionModel: Model<NewsRevisionDocument>,
    private elasticsearchService: ElasticsearchService,
    private redisService: RedisService,
    private logger: WinstonLoggerService,
  ) {}

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

    return article;
  }

  async getArticles(filters: any) {
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

    const articles = await this.newsArticleModel
      .find(filter)
      .populate('author', 'name email avatar')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.newsArticleModel.countDocuments(filter);

    return {
      items: articles,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    };
  }

  async getArticleBySlug(slug: string) {
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

    // Increment views
    await this.newsArticleModel.updateOne({ slug }, { $inc: { viewCount: 1 } });

    return {
      success: true,
      data: article,
    };
  }

  async getArticleById(id: string) {
    const article = await this.newsArticleModel
      .findById(id)
      .populate('author', 'name email avatar')
      .lean();

    if (!article || article.isDeleted) {
      throw new NotFoundException('Article not found');
    }

    // Increment views
    await this.newsArticleModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

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

    await this.redisService.set(cacheKey, JSON.stringify(articles), 300);
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

    return article;
  }
}
