# ScoreNews Backend - NestJS

Enterprise-grade NestJS backend for ScoreNews with MongoDB, Redis, Elasticsearch, and WebSocket support.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB (Atlas or local)
- Redis
- Elasticsearch (optional)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your configuration

# Start development server
npm run start:dev
```

### Environment Variables

Copy from `backend/.env` or use `.env.example` as template. All environment variables from the old backend are supported.

## 📁 Project Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── app.controller.ts       # Root controller
├── app.service.ts         # Root service
├── config/                 # Configuration
│   └── config.schema.ts   # Environment validation
├── common/                 # Shared utilities
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Request/response interceptors
│   ├── middleware/        # Custom middleware
│   ├── guards/           # Auth guards
│   ├── decorators/       # Custom decorators
│   └── logger/           # Winston logger
├── database/              # MongoDB connection
├── redis/                 # Redis service
├── elasticsearch/         # Elasticsearch service
├── websocket/            # WebSocket gateway
└── modules/              # Feature modules
    ├── auth/             # Authentication
    ├── users/            # User management
    ├── cricket/          # Cricket data
    ├── football/         # Football data
    ├── news/             # News articles
    ├── content/          # User content
    ├── threads/          # Discussion threads
    ├── comments/         # Comments system
    ├── media/            # Media uploads
    └── admin/            # Admin operations
```

## 🏗️ Architecture

### Module Structure (Template)

Each feature module follows this structure:

```
modules/[feature]/
├── [feature].module.ts      # Module definition
├── [feature].controller.ts  # REST endpoints
├── [feature].service.ts     # Business logic
├── schemas/                 # Mongoose schemas
├── dto/                     # Data Transfer Objects
├── guards/                  # Route guards
└── interfaces/              # TypeScript interfaces
```

### Key Features

- ✅ **MongoDB** with Mongoose for data persistence
- ✅ **Redis** for caching and sessions
- ✅ **Elasticsearch** for search functionality
- ✅ **WebSocket** for real-time updates
- ✅ **JWT Authentication** with refresh tokens
- ✅ **Rate Limiting** with Throttler
- ✅ **Validation** with class-validator
- ✅ **Swagger** API documentation
- ✅ **Winston** logging
- ✅ **Health Checks** with Terminus
- ✅ **Task Scheduling** with @nestjs/schedule
- ✅ **Background Jobs** with Bull queues

## 📝 API Documentation

When running in development, Swagger docs are available at:
- `http://localhost:5000/api/docs`

## 🔧 Development

```bash
# Development with hot reload
npm run start:dev

# Production build
npm run build
npm run start:prod

# Run tests
npm run test

# Lint code
npm run lint
```

## 🔐 Authentication

The API uses JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## 📊 Health Check

```
GET /api/health
```

Returns health status of all services (MongoDB, Redis, etc.)

## 🚧 Migration Status

### ✅ Completed
- [x] Project setup and configuration
- [x] Core infrastructure (Database, Redis, Elasticsearch)
- [x] Common utilities (Filters, Interceptors, Middleware)
- [x] Logger service
- [x] Health checks
- [x] User schema
- [x] Basic module structure

### 🚧 In Progress
- [ ] Auth module (DTOs, Service, Controller, Guards)
- [ ] Users module
- [ ] Cricket module
- [ ] Football module
- [ ] News module
- [ ] Content module
- [ ] Threads module
- [ ] Comments module
- [ ] Media module
- [ ] Admin module
- [ ] WebSocket gateway

### 📋 Next Steps

1. Complete Auth module following the pattern in `modules/auth/`
2. Complete remaining modules using Auth as template
3. Copy business logic from old backend controllers/services
4. Migrate all Mongoose models to NestJS schemas
5. Set up WebSocket gateway for real-time updates
6. Add comprehensive tests
7. Set up CI/CD pipeline

## 🔄 Migration from Express.js

The old Express.js backend structure is preserved in `../backend/`. Use it as reference for:

- Business logic in controllers
- Data models in models/
- API routes in routes/
- Services in services/
- Utilities in utils/

## 📚 Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Mongoose Documentation](https://mongoosejs.com/)
- [Swagger/OpenAPI](https://swagger.io/)

## 🤝 Contributing

Follow the established patterns in the codebase. Each module should be:
- Well-documented
- Type-safe
- Tested
- Following NestJS best practices




