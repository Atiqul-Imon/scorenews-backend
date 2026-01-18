import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

// These packages use CommonJS, need to import this way
const compression = require('compression');
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { WinstonLoggerService } from './common/logger/winston-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  
  // Set up Winston logger after app creation
  const configService = app.get(ConfigService);
  const winstonLogger = new WinstonLoggerService(configService);
  app.useLogger(winstonLogger);
  const port = configService.get<number>('PORT', 5000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }));

  // Compression
  app.use(compression());

  // Cookie parser
  app.use(cookieParser());

  // Request ID middleware (must be early)
  app.use(new RequestIdMiddleware().use);

  // CORS
  const corsOrigins = configService.get<string>('CORS_ORIGIN', frontendUrl)
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new TimeoutInterceptor(configService.get<number>('REQUEST_TIMEOUT_MS', 30000)),
  );

  // Swagger API Documentation
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Sports Platform API')
      .setDescription('Enterprise-grade API for Sports Platform - Live Cricket & Football Scores')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addServer(`http://localhost:${port}`, 'Development')
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('cricket', 'Cricket matches and data')
      .addTag('football', 'Football matches and data')
      .addTag('news', 'News articles')
      .addTag('content', 'User-generated content')
      .addTag('threads', 'Discussion threads')
      .addTag('comments', 'Comments system')
      .addTag('media', 'Media uploads')
      .addTag('admin', 'Admin operations')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // Trust proxy (for rate limiting behind reverse proxy)
  // Note: This is handled by the underlying Express instance if needed

  await app.listen(port);

  const logger = app.get(WinstonLoggerService);
  logger.log(`🚀 Server running on port ${port}`, 'Bootstrap');
  logger.log(`🌍 Environment: ${nodeEnv}`, 'Bootstrap');
  logger.log(`📊 Health check: http://localhost:${port}/api/health`, 'Bootstrap');
  logger.log(`📚 API Docs: http://localhost:${port}/api/docs`, 'Bootstrap');
  logger.log(`🔒 Request ID tracking: Enabled`, 'Bootstrap');
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

