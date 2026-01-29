# Match Result Calculation Fix

## Problem Identified

Match 66046 (South Africa vs West Indies) was showing incorrect result:
- **Wrong**: "West Indies won by 47 runs"
- **Correct**: "South Africa won by 7 wickets"

## Root Cause

1. **SportsMonks API provides `winner_team_id`** - The API includes a `winner_team_id` field in the fixtures endpoint response, but our code was not using it.

2. **Calculation Logic Issue** - The result calculation was based solely on comparing runs, but when scores are close or there's data inconsistency, this can lead to incorrect results.

3. **Data Saved at Wrong Time** - The match result was calculated and saved when the match transitioned to "completed", but the data might have been incomplete or the calculation happened with incorrect team mappings.

## Solution Implemented

### 1. Use API's `winner_team_id` as Primary Source ✅

**Location**: `match-transformers.ts` - `calculateMatchResult()`

Updated the function to accept and use `winner_team_id` from the API when available:

```typescript
export function calculateMatchResult(
  currentScore: any,
  scores: any[],
  teams: any,
  localteamId: any,
  visitorteamId: any,
  isV2Format: boolean,
  winnerTeamId?: any // NEW: Use API's winner_team_id
): any {
  // Determine winner - use API's winner_team_id if available
  let homeWon: boolean;
  if (winnerTeamId !== undefined && winnerTeamId !== null) {
    // Use API's winner_team_id as primary source of truth
    homeWon = winnerTeamId === localteamId;
  } else {
    // Fallback: calculate from scores
    homeWon = homeRuns > awayRuns;
  }
  // ... rest of calculation
}
```

### 2. Pass `winner_team_id` from Transformer ✅

**Location**: `match-transformers.ts` - `transformSportsMonksMatchToFrontend()`

Updated to pass `apiMatch.winner_team_id` to the calculation function:

```typescript
matchResult = calculateMatchResult(
  currentScore,
  scores,
  teams,
  apiMatch.localteam_id,
  apiMatch.visitorteam_id,
  isV2Format,
  apiMatch.winner_team_id // NEW: Pass API's winner_team_id
);
```

### 3. Fixed Match 66046 ✅

Created and ran a fix script (`fix-match-66046-result.ts`) that:
- Fetched fresh data from SportsMonks API
- Verified `winner_team_id: 40` (South Africa)
- Calculated correct result: "South Africa won by 7 wickets"
- Updated the database with the correct result

## How Match Results Are Saved

### When Match Completes:

1. **Detection**: `getLiveMatches()` detects when a match transitions from "live" to "completed"

2. **Re-fetch**: System re-fetches from `/fixtures/{matchId}` endpoint to get final, complete data

3. **Transform**: Data is transformed using `transformSportsMonksMatchToFrontend()`, which:
   - Extracts scores from scoreboards
   - Maps teams (home/away)
   - Calculates result using `calculateMatchResult()` with `winner_team_id`

4. **Save**: Final data is saved to MongoDB via `saveMatchToDatabase()`

### Data Sources:

- **Primary**: SportsMonks API `/fixtures/{matchId}` endpoint
  - Provides: `winner_team_id`, complete scoreboards, batting/bowling data
  - Most reliable for completed matches

- **Fallback**: Calculation from scores
  - Used when `winner_team_id` is not available
  - Compares runs to determine winner
  - Uses innings data to determine margin type (runs vs wickets)

## Verification

✅ Match 66046 now shows correct result: "South Africa won by 7 wickets"
✅ API's `winner_team_id` is now used as primary source of truth
✅ Calculation logic still works as fallback when `winner_team_id` is not available

## Prevention

Future matches will:
1. Use API's `winner_team_id` when available (most reliable)
2. Re-fetch from fixtures endpoint when match completes
3. Calculate result with correct team mappings
4. Save accurate final data to database

## Testing

To verify a match result is correct:
1. Check API: `GET /fixtures/{matchId}` - look for `winner_team_id`
2. Check database: Verify `result.winnerName` matches API's `winner_team_id`
3. Check calculation: Verify margin type (runs vs wickets) is correct based on batting order

