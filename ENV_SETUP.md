# Environment Variables Setup Guide

## Quick Start

1. **Copy the example file:**
   ```bash
   cd backend-nestjs
   cp .env.example .env
   ```

2. **Edit the .env file and fill in your actual values:**
   ```bash
   nano .env  # or use your preferred editor
   ```

3. **Set proper permissions (recommended):**
   ```bash
   chmod 600 .env
   ```

## Required Variables

These variables **MUST** be set for the backend to run:

- `MONGODB_URI` - MongoDB connection string (required)
- `JWT_SECRET` - JWT signing secret (required, min 32 chars)
- `JWT_REFRESH_SECRET` - JWT refresh token secret (required, min 32 chars)

## Optional but Recommended Variables

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - For email verification and password reset
- `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` - For caching
- `CLOUDINARY_*` or `IMAGEKIT_*` - For media uploads
- `SPORTMONKS_API_TOKEN` - For live sports data
- `CRICKET_API_KEY` - For cricket data (fallback)

## Variable Descriptions

### Server Configuration
- `NODE_ENV`: Environment mode (development, production, test)
- `PORT`: Server port (default: 5000)
- `FRONTEND_URL`: Frontend URL for CORS and email links
- `BACKEND_URL`: Backend URL
- `REQUEST_TIMEOUT_MS`: Request timeout in milliseconds (default: 30000)

### Database
- `MONGODB_URI`: MongoDB connection string (required)

### Redis
- `REDIS_URL`: Full Redis connection URL (e.g., redis://localhost:6379)
- `REDIS_HOST`: Redis host (if not using REDIS_URL)
- `REDIS_PORT`: Redis port (if not using REDIS_URL)

### JWT
- `JWT_SECRET`: Secret key for JWT tokens (required, min 32 chars)
- `JWT_REFRESH_SECRET`: Secret key for refresh tokens (required, min 32 chars)
- `JWT_EXPIRES_IN`: Access token expiration (default: 15m)
- `JWT_REFRESH_EXPIRES_IN`: Refresh token expiration (default: 7d)

### Email (for verification and password reset)
- `SMTP_HOST`: SMTP server hostname
- `SMTP_PORT`: SMTP server port (usually 587 or 465)
- `SMTP_USER`: SMTP username/email
- `SMTP_PASS`: SMTP password/app password

### Cloud Storage (for media uploads)
Choose one:
- **Cloudinary**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **ImageKit**: `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`

### API Keys (for sports data)
- `SPORTMONKS_API_TOKEN`: SportsMonks API token
- `CRICKET_API_KEY`: Cricket Data API key (fallback)
- `FOOTBALL_API_KEY`: Football API key (optional)
- `ESPN_API_KEY`: ESPN API key (optional)

## Generating Secure JWT Secrets

You can generate secure random secrets using:

```bash
# Using openssl
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Security Notes

1. **Never commit .env files to git** - They are in .gitignore by default
2. **Use strong secrets** - JWT secrets should be at least 32 characters
3. **Set file permissions** - `chmod 600 .env` restricts access
4. **Use different values for production** - Never use development secrets in production
5. **Rotate secrets regularly** - Especially if compromised

## Validation

The backend validates all environment variables on startup using Joi schema. Missing required variables will prevent the server from starting.

To check if your configuration is valid:
```bash
cd backend-nestjs
npm run start:dev
```

If there are validation errors, they will be displayed in the console.


