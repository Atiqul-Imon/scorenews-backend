# CORS Update: Whitelist scorer.scorenews.net

## ✅ Changes Made

### 1. WebSocket Gateway Updated
**File**: `src/websocket/websocket.gateway.ts`

- **Before**: WebSocket gateway allowed all origins (`origin: '*'`)
- **After**: WebSocket gateway now uses `CORS_ORIGIN` environment variable (same as main.ts)
- **Security**: Now properly restricts WebSocket connections to whitelisted domains

### 2. Environment Variable Template Updated
**File**: `env.example`

- Added `https://scorer.scorenews.net` to `CORS_ORIGIN` example
- Includes all frontend domains:
  - `http://localhost:3000` (development)
  - `https://scorenews.net` (production main site)
  - `https://www.scorenews.net` (production www)
  - `https://scorer.scorenews.net` (production scorer app)

## 🔧 Production Update Required

### Step 1: Update Production Environment Variable

**On your production server** (DigitalOcean droplet or wherever backend is deployed):

1. **SSH to your server**:
   ```bash
   ssh root@<your-server-ip>
   # or
   ssh <username>@<your-server-ip>
   ```

2. **Navigate to backend directory**:
   ```bash
   cd /var/www/sports-platform-api
   # or wherever your backend is deployed
   ```

3. **Edit `.env` file**:
   ```bash
   nano .env
   # or
   vi .env
   ```

4. **Update `CORS_ORIGIN`**:
   ```env
   CORS_ORIGIN=https://scorenews.net,https://www.scorenews.net,https://scorer.scorenews.net
   ```
   
   **Important**:
   - Use `https://` (not `http://`) for production domains
   - Separate with commas (no spaces around commas)
   - Include all frontend domains

5. **Save and exit** (Ctrl+X, then Y, then Enter for nano)

### Step 2: Restart Backend Service

**If using Docker**:
```bash
docker-compose restart
# or
docker-compose down && docker-compose up -d
```

**If using PM2**:
```bash
pm2 restart sports-platform-api --update-env
```

**If using systemd**:
```bash
sudo systemctl restart sports-platform-api
```

**If using npm/node directly**:
```bash
# Stop the process (Ctrl+C or kill)
# Then restart
npm run start:prod
# or
node dist/main.js
```

### Step 3: Verify CORS is Working

**Test API CORS**:
```bash
curl -H "Origin: https://scorer.scorenews.net" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type,Authorization" \
     -X OPTIONS \
     https://api.scorenews.net/api/v1/health \
     -v
```

**Expected response headers**:
```
Access-Control-Allow-Origin: https://scorer.scorenews.net
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

**Test WebSocket Connection**:
1. Open browser console on `https://scorer.scorenews.net`
2. Try connecting to WebSocket
3. Should connect without CORS errors

## 📋 Current CORS Configuration

### Main API (main.ts)
- **Location**: `src/main.ts` (lines 52-68)
- **Configuration**: Uses `CORS_ORIGIN` environment variable
- **Supports**: Comma-separated origins
- **Credentials**: Enabled (`credentials: true`)

### WebSocket Gateway
- **Location**: `src/websocket/websocket.gateway.ts` (lines 16-37)
- **Configuration**: Now uses `CORS_ORIGIN` environment variable (same as main.ts)
- **Namespace**: `/live`
- **Credentials**: Enabled

## 🔍 Verification Checklist

After updating and restarting:

- [ ] Backend service restarted successfully
- [ ] API CORS test passes (curl command above)
- [ ] Scorer app can make API requests without CORS errors
- [ ] WebSocket connections work from scorer app
- [ ] Main website (`scorenews.net`) still works
- [ ] No CORS errors in browser console

## 🐛 Troubleshooting

### CORS Still Not Working?

1. **Check environment variable is set correctly**:
   ```bash
   # On server
   grep CORS_ORIGIN .env
   ```

2. **Verify backend restarted with new env**:
   ```bash
   # Check logs
   pm2 logs sports-platform-api
   # or
   docker-compose logs backend
   ```

3. **Clear browser cache**:
   - Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
   - Or clear cache completely

4. **Check browser console**:
   - Open DevTools (F12)
   - Check Console tab for CORS errors
   - Check Network tab for failed requests

### WebSocket Connection Issues?

1. **Verify WebSocket URL**:
   - Should use `wss://` (not `ws://`) for HTTPS
   - Example: `wss://api.scorenews.net/live`

2. **Check WebSocket server is running**:
   - WebSocket runs on same port as API
   - Verify backend is accessible

3. **Check firewall/security groups**:
   - Ensure WebSocket port is open
   - Check if reverse proxy (nginx) allows WebSocket upgrades

## 📝 Notes

- **Development**: Local development uses `http://localhost:3000` and `http://localhost:3001`
- **Production**: All production domains use `https://`
- **Security**: Never use `*` in production CORS_ORIGIN
- **Multiple Domains**: Separate with commas, no spaces

## ✅ Status

- [x] WebSocket gateway updated to use CORS_ORIGIN
- [x] env.example updated with scorer domain
- [x] Documentation created
- [ ] Production .env updated (requires server access)
- [ ] Backend service restarted (requires server access)
- [ ] CORS verified working (requires testing)

---

**Next Steps**: Update production `.env` file and restart backend service.




