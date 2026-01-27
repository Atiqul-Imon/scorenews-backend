# Migration Guide: Express.js to NestJS

This guide helps you complete the migration from the old Express.js backend to the new NestJS backend.

## ✅ What's Already Done

1. **Project Structure** - Complete NestJS setup with latest dependencies
2. **Core Infrastructure**:
   - MongoDB connection with Mongoose
   - Redis service for caching
   - Elasticsearch service for search
   - Winston logger
   - Health checks
   - Request ID middleware
   - Error handling filters
   - Response interceptors
   - Timeout interceptors
   - Rate limiting with Throttler

3. **Auth Module** - Complete implementation:
   - User registration
   - Login with JWT
   - Refresh tokens
   - JWT strategy
   - Auth guards
   - Public decorator

4. **Users Module** - Basic implementation

5. **Module Structure** - All feature modules created with placeholders

## 🚧 What Needs to Be Done

### 1. Complete Feature Modules

For each module (Cricket, Football, News, Content, Threads, Comments, Media, Admin), you need to:

#### Step 1: Create Schemas
Copy Mongoose models from `backend/src/models/` and convert to NestJS schemas:

```typescript
// Example: src/modules/cricket/schemas/cricket-match.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'cricket_matches' })
export class CricketMatch {
  @Prop({ required: true, unique: true, index: true })
  matchId: string;
  
  // ... other properties
}

export type CricketMatchDocument = CricketMatch & Document;
export const CricketMatchSchema = SchemaFactory.createForClass(CricketMatch);
```

#### Step 2: Create DTOs
Create Data Transfer Objects for request/response validation:

```typescript
// Example: src/modules/cricket/dto/get-matches.dto.ts
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetMatchesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(['live', 'completed', 'upcoming'])
  status?: string;
  
  // ... other filters
}
```

#### Step 3: Implement Service
Copy business logic from `backend/src/controllers/` and `backend/src/services/`:

```typescript
// Example: src/modules/cricket/cricket.service.ts
@Injectable()
export class CricketService {
  constructor(
    @InjectModel(CricketMatch.name) 
    private cricketMatchModel: Model<CricketMatchDocument>,
    private redisService: RedisService,
    // ... other dependencies
  ) {}

  async getMatches(filters: GetMatchesDto) {
    // Copy logic from backend/src/controllers/cricketController.ts
    // Adapt Express Request/Response to NestJS patterns
  }
}
```

#### Step 4: Implement Controller
Convert Express routes to NestJS controllers:

```typescript
// Example: src/modules/cricket/cricket.controller.ts
@Controller('cricket')
export class CricketController {
  constructor(private readonly cricketService: CricketService) {}

  @Get('matches')
  @Public() // or @UseGuards(JwtAuthGuard)
  async getMatches(@Query() filters: GetMatchesDto) {
    return this.cricketService.getMatches(filters);
  }
}
```

#### Step 5: Update Module
Register schemas and dependencies:

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CricketMatch.name, schema: CricketMatchSchema }
    ]),
    RedisModule,
    // ... other modules
  ],
  controllers: [CricketController],
  providers: [CricketService],
  exports: [CricketService],
})
export class CricketModule {}
```

### 2. WebSocket Gateway

Copy real-time logic from `backend/src/utils/socket.ts`:

```typescript
// src/websocket/websocket.gateway.ts
@WebSocketGateway()
export class WebSocketGateway {
  @WebSocketServer()
  server: Server;

  // Copy methods from old socket.ts
  // - initializeSocketIO
  // - broadcastMatchUpdate
  // - handleMatchEnd
  // - handleGoalScored
  // - handleWicketFallen
}
```

### 3. File Upload

Implement file upload using NestJS FileInterceptor:

```typescript
// src/modules/media/media.controller.ts
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(@UploadedFile() file: Express.Multer.File) {
  // Copy logic from backend/src/middleware/upload.ts
}
```

### 4. External API Services

Copy services from `backend/src/services/`:
- `cricketApiService.ts` → `src/modules/cricket/services/cricket-api.service.ts`
- `footballApiService.ts` → `src/modules/football/services/football-api.service.ts`
- `sportsmonksService.ts` → Create shared service

### 5. Validation

Convert Express validators to class-validator DTOs:

```typescript
// Old: backend/src/middleware/validation.ts
// New: Use @IsString(), @IsEmail(), etc. in DTOs
```

### 6. Admin Operations

Copy admin logic from `backend/src/controllers/adminController.ts`:
- User management
- Content moderation
- System settings

## 📋 Migration Checklist

### Core Features
- [ ] Auth module (✅ Done)
- [ ] Users module (✅ Basic done)
- [ ] Cricket module
- [ ] Football module
- [ ] News module
- [ ] Content module
- [ ] Threads module
- [ ] Comments module
- [ ] Media module
- [ ] Admin module

### Infrastructure
- [x] MongoDB connection
- [x] Redis service
- [x] Elasticsearch service
- [x] Logger
- [x] Health checks
- [ ] WebSocket gateway
- [ ] File upload
- [ ] Email service
- [ ] Background jobs (Bull queues)

### Schemas/Models
- [x] User
- [ ] CricketMatch
- [ ] FootballMatch
- [ ] CricketTeam
- [ ] NewsArticle
- [ ] Content
- [ ] Thread
- [ ] Comment
- [ ] Vote

## 🔄 Migration Pattern

For each feature:

1. **Copy Model** → Convert to NestJS Schema
2. **Copy Controller Logic** → Move to Service
3. **Copy Routes** → Convert to Controller endpoints
4. **Copy Validation** → Convert to DTOs with class-validator
5. **Copy Middleware** → Convert to Guards/Interceptors
6. **Test** → Ensure API compatibility with frontend

## 🎯 Key Differences

### Express.js → NestJS

| Express.js | NestJS |
|------------|--------|
| `req, res` | `@Req(), @Res()` or DTOs |
| `router.get()` | `@Get()` decorator |
| `middleware` | `@UseGuards()`, `@UseInterceptors()` |
| `app.use()` | Module imports |
| `res.json()` | Return value (auto-serialized) |
| `next()` | Exceptions (auto-handled) |

### Example Conversion

**Express.js:**
```typescript
router.get('/matches', async (req, res) => {
  const matches = await Match.find();
  res.json({ success: true, data: matches });
});
```

**NestJS:**
```typescript
@Get('matches')
async getMatches() {
  const matches = await this.matchService.findAll();
  return matches; // Auto-wrapped by TransformInterceptor
}
```

## 📚 Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Mongoose with NestJS](https://docs.nestjs.com/techniques/mongodb)
- [Validation](https://docs.nestjs.com/techniques/validation)
- [File Upload](https://docs.nestjs.com/techniques/file-upload)

## 🚀 Next Steps

1. Start with one module (e.g., Cricket)
2. Complete it fully (Schema, DTOs, Service, Controller)
3. Test with frontend
4. Repeat for other modules
5. Add WebSocket functionality
6. Add file upload
7. Complete admin features
8. Add comprehensive tests

## 💡 Tips

- Use the Auth module as a template
- Keep API endpoints compatible with frontend
- Use DTOs for all inputs/outputs
- Leverage NestJS dependency injection
- Use decorators for common patterns
- Follow NestJS best practices





