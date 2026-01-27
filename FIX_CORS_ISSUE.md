# 🔧 Fix CORS Issue - Frontend Cannot Access Backend API

## Problem

Frontend at `https://www.scorenews.net` is getting CORS errors when trying to access backend at `https://api.scorenews.net`:

```
Access to fetch at 'https://api.scorenews.net/api/...' from origin 'https://www.scorenews.net' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause

The backend's `CORS_ORIGIN` environment variable on DigitalOcean droplet doesn't include `https://www.scorenews.net`.

## Solution

### Step 1: SSH to DigitalOcean Droplet

```bash
ssh root@<droplet-ip>
# or
ssh <username>@<droplet-ip>
```

### Step 2: Update Backend Environment Variables

Navigate to the backend directory:
```bash
cd /var/www/sports-platform-api
# or wherever your backend is deployed
```

Edit the `.env` file:
```bash
nano .env
# or
vi .env
```

### Step 3: Update CORS_ORIGIN

Find the `CORS_ORIGIN` line and update it to include both domains:

```env
FRONTEND_URL=https://scorenews.net
CORS_ORIGIN=https://scorenews.net,https://www.scorenews.net
```

**Important**: 
- Include both `scorenews.net` and `www.scorenews.net`
- Separate with commas (no spaces around commas)
- Use `https://` (not `http://`)

### Step 4: Restart Backend Service

**If using Docker:**
```bash
docker-compose restart
# or
docker-compose down && docker-compose up -d
```

**If using PM2:**
```bash
pm2 restart sports-platform-api --update-env
```

**If using systemd:**
```bash
sudo systemctl restart sports-platform-api
```

### Step 5: Verify CORS is Working

Test from your local machine:
```bash
curl -H "Origin: https://www.scorenews.net" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://api.scorenews.net/api/v1/health \
     -v
```

You should see `Access-Control-Allow-Origin: https://www.scorenews.net` in the response headers.

## Alternative: Quick Fix via Docker Environment

If using Docker, you can also set it via environment variables in `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - CORS_ORIGIN=https://scorenews.net,https://www.scorenews.net
      - FRONTEND_URL=https://scorenews.net
```

Then restart:
```bash
docker-compose up -d
```

## WebSocket CORS Fix

The WebSocket gateway might also need updating. Check `src/modules/websocket/websocket.gateway.ts`:

```typescript
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['https://scorenews.net', 'https://www.scorenews.net'],
    credentials: true,
  },
  namespace: '/live',
})
```

After updating, rebuild and redeploy:
```bash
npm run build
docker-compose up -d --build
```

## Verification

After updating and restarting:

1. ✅ **Check backend logs** - Should see CORS configuration
2. ✅ **Test API endpoint** - Should not have CORS errors
3. ✅ **Test WebSocket** - Should connect successfully
4. ✅ **Check browser console** - No more CORS errors

## Current Configuration

Backend CORS is configured in `src/main.ts`:
- Reads from `CORS_ORIGIN` environment variable
- Supports comma-separated origins
- Allows credentials

## Status

- ✅ Backend code is configured correctly
- ⏳ Need to update `.env` on DigitalOcean droplet
- ⏳ Need to restart backend service

---

**Quick Command Summary:**
```bash
# SSH to droplet
ssh root@<droplet-ip>

# Navigate to backend
cd /var/www/sports-platform-api

# Edit .env
nano .env
# Update: CORS_ORIGIN=https://scorenews.net,https://www.scorenews.net

# Restart (Docker)
docker-compose restart

# Or restart (PM2)
pm2 restart sports-platform-api --update-env
```


