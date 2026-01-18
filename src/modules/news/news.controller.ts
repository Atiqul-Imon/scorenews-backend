import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Req, NotFoundException, All } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NewsService } from './news.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all news articles' })
  @ApiResponse({ status: 200, description: 'Articles retrieved successfully' })
  async getArticles(@Query() filters: any) {
    return this.newsService.getArticles(filters);
  }

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Get trending news articles' })
  @ApiResponse({ status: 200, description: 'Trending articles retrieved successfully' })
  async getTrending(@Query('limit') limit: number = 4) {
    return this.newsService.getTrending(limit);
  }

  @Public()
  @Get('slug/:year/:month/:slug*')
  @ApiOperation({ summary: 'Get news article by slug (structured path with optional sub-slugs)' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleBySlug(
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('slug') slug: string,
    @Req() req: Request,
  ) {
    // Handle slug parameter - it might contain slashes if there are sub-parts
    // e.g., "the-rise-of-young-stars-in-modern-cricket" or "category/sub-category/article"
    const slugParts = slug.split('/');
    const baseSlug = slugParts[0]; // Take first part, ignore additional slashes
    
    const fullSlug = `news/${year}/${month}/${baseSlug}`;
    return this.newsService.getArticleBySlug(fullSlug);
  }

  // Catch-all route for encoded slugs (as fallback)
  @Public()
  @Get('slug-encoded*')
  @ApiOperation({ summary: 'Get news article by encoded slug (fallback)' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleBySlugEncoded(@Req() req: Request) {
    // Extract slug from URL path for encoded slashes
    const url = req.originalUrl || req.url || '';
    const pathWithoutQuery = url.split('?')[0];
    const slugMatch = pathWithoutQuery.match(/\/slug-encoded(.*)$/);
    
    if (!slugMatch || !slugMatch[1]) {
      throw new NotFoundException('Slug not found in URL');
    }
    
    let slugPart = slugMatch[1].replace(/^\//, '');
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(slugPart);
    } catch (e) {
      decodedSlug = slugPart;
    }
    
    return this.newsService.getArticleBySlug(decodedSlug);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get news article by ID' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleById(@Param('id') id: string) {
    return this.newsService.getArticleById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new news article' })
  @ApiResponse({ status: 201, description: 'Article created successfully' })
  async createArticle(@Body() data: any, @CurrentUser() user: any) {
    return this.newsService.createArticle(data, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a news article' })
  @ApiResponse({ status: 200, description: 'Article updated successfully' })
  async updateArticle(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
    return this.newsService.updateArticle(id, data, user.id || user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a news article' })
  @ApiResponse({ status: 200, description: 'Article published successfully' })
  async publishArticle(@Param('id') id: string) {
    return this.newsService.publishArticle(id);
  }
}
