import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
// import { redisStore } from 'cache-manager-ioredis-yet';
import { BullModule } from '@nestjs/bull';
import { TerminusModule } from '@nestjs/terminus';
import { configValidationSchema } from './config/config.schema';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { LoggerModule } from './common/logger/logger.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CricketModule } from './modules/cricket/cricket.module';
import { FootballModule } from './modules/football/football.module';
import { NewsModule } from './modules/news/news.module';
import { ContentModule } from './modules/content/content.module';
import { ThreadsModule } from './modules/threads/threads.module';
import { CommentsModule } from './modules/comments/comments.module';
import { MediaModule } from './modules/media/media.module';
import { AdminModule } from './modules/admin/admin.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: ['.env.local', '.env'],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      }),
      inject: [ConfigService],
    }),

    // Redis Cache (using RedisModule directly instead)
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   imports: [ConfigModule],
    //   useFactory: async (configService: ConfigService) => {
    //     const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    //     return {
    //       store: await redisStore({
    //         url: redisUrl,
    //         ttl: 300, // 5 minutes default TTL
    //       }),
    //     };
    //   },
    //   inject: [ConfigService],
    // }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        // Significantly increased production limit to handle frontend polling and multiple users
        // 5000 req per 15 min = ~333 req/min = ~5.5 req/sec per IP (allows for multiple users)
        const defaultMax = nodeEnv === 'development' ? 10000 : 5000;
        return {
          throttlers: [{
            ttl: configService.get<number>('RATE_LIMIT_WINDOW_MS', 900000),
            limit: configService.get<number>('RATE_LIMIT_MAX_REQUESTS', defaultMax),
          }],
        };
      },
      inject: [ConfigService],
    }),

    // Task Scheduling
    ScheduleModule.forRoot(),

    // Bull Queue (for background jobs)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),

    // Health Checks
    TerminusModule,

    // Core Modules
    DatabaseModule,
    RedisModule,
    ElasticsearchModule,
    LoggerModule,
    EmailModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    CricketModule,
    FootballModule,
    NewsModule,
    ContentModule,
    ThreadsModule,
    CommentsModule,
    MediaModule,
    AdminModule,
    WebsocketModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

