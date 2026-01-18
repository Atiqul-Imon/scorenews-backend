import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  BACKEND_URL: Joi.string().default('http://localhost:5000'),
  REQUEST_TIMEOUT_MS: Joi.number().default(30000),

  // Database
  MONGODB_URI: Joi.string().required(),

  // Redis
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // Elasticsearch
  ELASTICSEARCH_URL: Joi.string().default('http://localhost:9200'),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // File Upload
  MAX_FILE_SIZE: Joi.string().default('50MB'),
  ALLOWED_FILE_TYPES: Joi.string().default('mp4,mp3,wav,pdf,doc,docx,txt'),
  UPLOAD_PATH: Joi.string().default('./uploads'),

  // API Keys
  CRICKET_API_KEY: Joi.string().optional(),
  FOOTBALL_API_KEY: Joi.string().optional(),
  ESPN_API_KEY: Joi.string().optional(),
  SPORTMONKS_BASE_URL: Joi.string().optional(),
  SPORTMONKS_API_TOKEN: Joi.string().optional(),

  // Email
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),

  // Cloud Storage
  CLOUDINARY_CLOUD_NAME: Joi.string().optional(),
  CLOUDINARY_API_KEY: Joi.string().optional(),
  CLOUDINARY_API_SECRET: Joi.string().optional(),
  IMAGEKIT_PUBLIC_KEY: Joi.string().optional(),
  IMAGEKIT_PRIVATE_KEY: Joi.string().optional(),
  IMAGEKIT_URL_ENDPOINT: Joi.string().optional(),

  // Monitoring
  SENTRY_DSN: Joi.string().optional(),
  NEW_RELIC_LICENSE_KEY: Joi.string().optional(),

  // Admin
  ADMIN_EMAIL: Joi.string().email().optional(),
  ADMIN_PASSWORD: Joi.string().optional(),
  ADMIN_NAME: Joi.string().optional(),
});
