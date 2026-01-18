import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
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
