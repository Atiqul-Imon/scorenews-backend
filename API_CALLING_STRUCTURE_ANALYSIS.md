# API Calling Structure Analysis

## Overview
This document analyzes the API calling patterns in the codebase at commit `9d43ef7` without modifying any code.

---

## 1. API Endpoints Used

### SportsMonks Service (`sportsmonks.service.ts`)

#### 1.1 `getLiveMatches(sport: 'cricket')`
- **Endpoint**: `https://cricket.sportmonks.com/api/v2.0/livescores`
- **Includes**: `scoreboards,localteam,visitorteam,venue`
- **Cache Buster**: `_t: timestamp` (line 74)
- **Cache Headers**: `Cache-Control: no-cache, no-store, must-revalidate` (line 77-79)
- **Redis Caching**: ❌ NO (cache buster prevents it)
- **Frequency**: Every 15 seconds (from scheduler)
- **API Calls/Hour**: 240 calls/hour

#### 1.2 `getMatchDetails(matchId, sport: 'cricket')`
- **Strategy**: Two-step approach
  - **Step 1**: Calls `/livescores` endpoint first (line 368-396)
  - **Step 2**: Calls `/fixtures/{id}` endpoint (line 417-429)
- **Cache Buster**: `_t: timestamp` (lines 373, 422, 467)
- **Cache Headers**: `Cache-Control: no-cache, no-store, must-revalidate` (lines 375-379, 424-428)
- **Redis Caching**: ❌ NO (cache buster prevents it)
- **API Calls Per Request**: **2 calls** (1 for `/livescores`, 1 for `/fixtures/{id}`)
- **Retry Logic**: Yes, with minimal includes fallback (line 450-487)
- **Called From**:
  - User match detail page requests
  - Transition service (`checkMatchCompletion`)
  - Match migration process

#### 1.3 `getPlayerDetails(playerId)`
- **Endpoint**: `https://cricket.sportmonks.com/api/v2.0/players/{playerId}`
- **Redis Caching**: ❌ NO (line 606 comment says "No caching")
- **Called From**: `enrichPlayerNames()` in `live-match.service.ts`
- **Parallel Execution**: ✅ YES (via `Promise.all()` - line 346 in live-match.service.ts)

#### 1.4 `getCommentary(matchId, sport: 'cricket')`
- **Endpoint**: `https://cricket.sportmonks.com/api/v2.0/fixtures/{matchId}`
- **Includes**: `balls.batsman,balls.bowler,balls.score,balls.batsmanout,balls.catchstump` (or just `balls` on retry)
- **Cache Buster**: `_t: timestamp` (lines 638, 658)
- **Cache Headers**: `Cache-Control: no-cache, no-store, must-revalidate` (lines 640-644, 660-664)
- **Redis Caching**: ❌ NO (cache buster prevents it)
- **Called From**: User commentary requests

#### 1.5 `getCompletedMatches(sport: 'cricket')`
- **Endpoint**: `https://cricket.sportmonks.com/api/v2.0/fixtures`
- **Includes**: `scoreboards,localteam,visitorteam,venue,batting.player,bowling.player`
- **Redis Caching**: ❌ NO (line 179 comment says "No caching")
- **Frequency**: Every 1 hour (from scheduler)

---

## 2. Scheduler Patterns (`match-scheduler.service.ts`)

### 2.1 Live Match Updates
- **Interval**: 15 seconds (line 60)
- **Function**: `liveMatchService.fetchAndUpdateLiveMatches()`
- **API Calls**: 
  - 1 call to `getLiveMatches()` per interval
  - Plus player enrichment calls (see below)

### 2.2 Transition Checks
- **Interval**: 2 minutes (120 seconds, line 49)
- **Function**: `matchTransitionService.processTransitions()`
- **API Calls**: 
  - For each live match: `checkMatchCompletion()` → `getMatchDetails()` → **2 API calls**

### 2.3 Completed Match Sync
- **Interval**: 1 hour (3600 seconds, line 69)
- **Function**: `completedMatchService.fetchAndSaveCompletedMatches()`
- **API Calls**: 1 call to `getCompletedMatches()` per interval

---

## 3. Player Enrichment Pattern (`live-match.service.ts`)

### 3.1 When Called
- **Location**: `fetchAndUpdateLiveMatches()` → `enrichPlayerNames()` (line 178)
- **Frequency**: Every 15 seconds (during background updates)
- **Trigger**: When match has batting/bowling data but player names are missing

### 3.2 How It Works
1. Collects all unique player IDs that need names (lines 280-322)
2. Creates parallel promises for ALL players (line 331-344)
3. Executes ALL promises simultaneously via `Promise.all()` (line 346)
4. **No rate limiting or delays between calls**

### 3.3 API Call Volume
- **Example Scenario**: 3 live matches, 20 players each without names
- **API Calls**: 60 simultaneous calls via `Promise.all()`
- **Frequency**: Every 15 seconds
- **Calls/Hour**: 60 players × 240 updates/hour = **14,400 calls/hour** (just for player enrichment!)

---

## 4. Transition Service Pattern (`match-transition.service.ts`)

### 4.1 Detection Process
1. Gets all live matches from database (line 31)
2. For each match:
   - Waits 2 seconds (line 41) - except first match
   - Calls `checkMatchCompletion()` (line 45)
   - Which calls `getMatchDetails()` (line 645 in live-match.service.ts)
   - Which makes **2 API calls** (livescores + fixtures)

### 4.2 API Call Volume
- **Example Scenario**: 3 live matches
- **API Calls Per Check**: 3 matches × 2 calls = **6 API calls**
- **Frequency**: Every 2 minutes
- **Calls/Hour**: 6 calls × 30 checks/hour = **180 calls/hour**

### 4.3 Migration Process
- When match is detected as completed:
  - Calls `getMatchDetails()` again (line 105) = **2 more API calls**
  - Total per transition: **8 API calls** (6 detection + 2 migration)

---

## 5. Cache Analysis

### 5.1 Redis Service
- **Available**: Yes (`redis.service.ts` exists)
- **Used For**: ❌ NOT USED for API responses
- **Reason**: All API calls use cache busters (`_t: timestamp`) and cache-control headers

### 5.2 Cache Busters Found
1. `getLiveMatches()`: Line 74 (`_t: timestamp`)
2. `getMatchDetails()`: Lines 373, 422, 467 (`_t: timestamp`)
3. `getCommentary()`: Lines 638, 658 (`_t: timestamp`)

### 5.3 Impact
- **Every API call hits the SportsMonks API directly**
- **No benefit from Redis caching**
- **Rate limits hit faster**

---

## 6. Rate Limiting Considerations

### 6.1 Current API Call Volume (Estimated)

#### Background Updates (Every 15 seconds):
- `getLiveMatches()`: 240 calls/hour
- Player enrichment: **14,400 calls/hour** (worst case: 3 matches × 20 players × 240 updates)
- **Subtotal**: ~14,640 calls/hour

#### Transition Checks (Every 2 minutes):
- Detection: 180 calls/hour (3 matches × 2 calls × 30 checks)
- Migration: Variable, but could be 60+ calls/hour
- **Subtotal**: ~240 calls/hour

#### User Requests:
- Match details: Variable (2 calls per request)
- Commentary: Variable (1-2 calls per request)
- **Subtotal**: ~50-200 calls/hour (depends on traffic)

#### **TOTAL ESTIMATED**: **~15,000+ API calls/hour** ⚠️

### 6.2 Rate Limit Issues
- **No rate limit detection** in most places
- **No exponential backoff** for player enrichment
- **Parallel API calls** via `Promise.all()` can overwhelm API
- **Cache busters** prevent any caching benefits

---

## 7. Key Findings

### 7.1 Critical Issues

1. **Player Enrichment Makes Excessive Parallel Calls**
   - 60+ simultaneous API calls every 15 seconds
   - No rate limiting or delays
   - Could easily exhaust API limits

2. **getMatchDetails() Makes 2 API Calls Per Request**
   - First calls `/livescores`, then `/fixtures/{id}`
   - Doubles the API call volume

3. **No Redis Caching**
   - All endpoints use cache busters
   - Every request hits API directly
   - Wastes API quota

4. **Transition Service Inefficient**
   - Calls `getMatchDetails()` for every match individually
   - Each call = 2 API requests
   - Could check `/livescores` first to see which matches are still live

### 7.2 Positive Aspects

1. **Delays Between Transition Checks**
   - 2 second delay between match checks (line 41 in match-transition.service.ts)
   - Helps prevent rate limiting

2. **Retry Logic**
   - `getMatchDetails()` has retry with minimal includes
   - `checkMatchCompletion()` has exponential backoff

3. **No getMatchDetails() During Background Updates**
   - Comment on line 83-86 says it's avoided
   - Only uses `/livescores` data

---

## 8. Recommendations (For Future Reference)

1. **Disable player enrichment during background updates**
   - Only enrich when user requests match details
   - Or add delays between player API calls

2. **Remove cache busters**
   - Let Redis caching work (30s TTL)
   - Reduces API calls by 50-70%

3. **Optimize getMatchDetails()**
   - Remove `/livescores` call, use only `/fixtures/{id}`
   - Saves 1 API call per request

4. **Optimize transition service**
   - Check `/livescores` first (1 call)
   - Only call `getMatchDetails()` for matches not in `/livescores`

5. **Add rate limit detection**
   - Check for "Too Many Attempts" errors
   - Implement exponential backoff
   - Return cached data when rate limited

---

## 9. Summary

**Current State**: The API calling structure is **very aggressive** with:
- ~15,000+ API calls/hour estimated
- No caching
- Parallel API calls without rate limiting
- Duplicate API calls (2 per match detail request)

**Expected Behavior**: API rate limits will be exhausted quickly, especially during peak times or when multiple matches are live.

**Root Causes**:
1. Player enrichment makes 60+ parallel calls every 15 seconds
2. Cache busters prevent Redis caching
3. `getMatchDetails()` makes 2 API calls per request
4. No rate limit detection or backoff for player enrichment



