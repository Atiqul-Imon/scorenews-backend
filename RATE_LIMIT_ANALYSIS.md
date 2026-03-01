# Rate Limit Analysis - Why "Too Many Attempts" Error Occurs

## Current API Call Frequency

### 1. **Scheduler - Live Matches Update**
- **Frequency**: Every 30 seconds (just changed from 15s)
- **Endpoint**: `/livescores`
- **Calls per hour**: 120 calls/hour
- **Service**: `MatchSchedulerService.liveUpdateInterval`

### 2. **Scheduler - Match Transitions**
- **Frequency**: Every 2 minutes
- **Endpoint**: `/fixtures/{id}` (for each live match)
- **Calls per hour**: ~30 calls/hour (if 1 live match) or more
- **Service**: `MatchSchedulerService.transitionInterval`

### 3. **Scheduler - Completed Matches Sync**
- **Frequency**: Every 1 hour
- **Endpoint**: `/fixtures`
- **Calls per hour**: 1 call/hour
- **Service**: `MatchSchedulerService.completedSyncInterval`

### 4. **User Requests**
- **When**: Every time a user visits the homepage
- **Endpoint**: `/livescores` (if database is empty)
- **Calls**: Variable, depends on traffic

### 5. **Match Details Page**
- **When**: User clicks on a match
- **Endpoint**: `/fixtures/{id}`
- **Calls**: Variable, depends on traffic

## Total API Calls Estimate

**Minimum (no users, just schedulers)**:
- 120 calls/hour (live updates)
- ~30 calls/hour (transitions, assuming 1 live match)
- 1 call/hour (completed sync)
- **Total: ~151 calls/hour**

**With users**:
- Could easily reach **200-300+ calls/hour** during peak traffic

## SportsMonk Rate Limits

Based on the "Too Many Attempts" error, SportsMonk likely has limits like:
- **Per minute**: ~10-20 requests
- **Per hour**: ~100-200 requests

Our current setup exceeds these limits!

## Root Causes

1. **Too frequent scheduler**: 30 seconds is still too frequent
2. **No caching**: Every call hits the API directly
3. **Multiple includes**: `scoreboards,localteam,visitorteam,venue` makes requests heavier
4. **Transition checks**: Each live match gets checked individually
5. **No rate limit detection**: We don't back off when rate limited

## Solutions

### Immediate Fixes:
1. **Increase scheduler interval to 60 seconds** (from 30s)
   - Reduces calls from 120/hour to 60/hour
2. **Add Redis caching** (15-30 second cache)
   - Prevents duplicate calls within cache window
3. **Reduce includes** (only essential data)
   - Faster requests, less load
4. **Batch transition checks** (check all matches in one call if possible)

### Long-term Fixes:
1. **Smart caching strategy**:
   - Cache live matches for 30 seconds
   - Only update if cache expired
2. **Rate limit detection and backoff**:
   - Detect rate limit errors
   - Automatically increase intervals when rate limited
3. **Use WebSocket for updates**:
   - Push updates to frontend instead of polling
4. **Database-first approach**:
   - Always serve from database
   - Update database in background only




