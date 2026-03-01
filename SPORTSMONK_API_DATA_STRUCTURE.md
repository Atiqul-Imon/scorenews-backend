# SportsMonk API v2.0 Data Structure Analysis

## Fixtures Endpoint: `/fixtures/{id}`

### Key Findings from Match 69104 (Completed Match)

#### ✅ **Status Detection Fields:**
- **`status`**: `"Finished"` - Primary indicator for completed matches
  - Values: `"NS"` (Not Started), `"Finished"`, `"LIVE"`, etc.
- **`note`**: `"England won by 12 runs"` - Contains result text
- **`winner_team_id`**: `38` - ID of winning team
- **`live`**: `true` - ⚠️ **Can be true even for completed matches** (API inconsistency)
- **`state_id`**: `undefined` - ⚠️ **NOT provided in fixtures endpoint response**

#### ✅ **Score Data:**
- **`scoreboards`**: Array of scoreboard objects
  - **Structure**: Each scoreboard is a separate object (NOT nested batting/bowling)
  - **Types**:
    - `type: "total"` - Contains actual score (total, overs, wickets)
    - `type: "extra"` - Contains extras (wide, noball, bye, leg_bye)
  - **Fields**:
    - `team_id`: Team identifier
    - `scoreboard`: `"S1"` (first innings) or `"S2"` (second innings)
    - `total`: Total runs
    - `overs`: Overs bowled
    - `wickets`: Wickets fallen
    - `wide`, `noball_runs`, `bye`, `leg_bye`, `penalty`: Extras

#### ⚠️ **Important Notes:**
1. **Scoreboards do NOT contain batting/bowling arrays nested inside**
   - Batting/bowling data must be fetched separately or from different endpoint
   - Scoreboards only contain aggregate totals

2. **`state_id` is NOT in fixtures endpoint response**
   - Status determination must rely on `status` field and `note` field
   - `state_id` might be available in `/livescores` endpoint but not `/fixtures/{id}`

3. **`live` field can be inconsistent**
   - Completed matches can have `live: true`
   - Always check `status` field and `note` field for completion

#### ✅ **Team Data:**
- **`localteam`**: Home team object
  - `id`, `name`, `code`, `image_path`, `country_id`, `national_team`
- **`visitorteam`**: Away team object
  - Same structure as localteam

#### ✅ **Venue Data:**
- **`venue`**: Venue object
  - `id`, `name`, `city`, `country_id`, `image_path`, `capacity`, `floodlight`

#### ✅ **League/Season Data:**
- **`league`**: League object (when included)
  - `id`, `name`, `code`, `type`, `image_path`
- **`season`**: Season object (when included)
  - `id`, `name`, `code`, `league_id`

#### ✅ **Match Metadata:**
- **`type`**: `"T20I"`, `"ODI"`, `"Test"`, etc.
- **`round`**: `"3rd T20I"`
- **`starting_at`**: ISO timestamp
- **`toss_won_team_id`**: Team ID that won toss
- **`elected`**: `"batting"` or `"bowling"`
- **`total_overs_played`**: Total overs in match
- **`man_of_match_id`**: Player ID for man of the match

---

## Status Determination Logic

### For Completed Matches:
1. **Primary**: `status === "Finished"` or `status.includes("Finished")`
2. **Secondary**: `note` field contains result (`"won by"`, `"tied"`, etc.)
3. **Tertiary**: `winner_team_id` is not null
4. **⚠️ Do NOT rely on**: `live` field or `state_id` (not reliable/available)

### For Live Matches:
1. **Primary**: `status` contains `"LIVE"` or innings indicators
2. **Secondary**: `live === true` AND `status !== "Finished"`
3. **Check**: Match is in `/livescores` endpoint

---

## Scoreboard Structure Example

```json
{
  "scoreboards": [
    {
      "id": 211891,
      "fixture_id": 69104,
      "team_id": 38,
      "type": "total",
      "scoreboard": "S1",
      "total": 128,
      "overs": 20,
      "wickets": 9
    },
    {
      "id": 211899,
      "fixture_id": 69104,
      "team_id": 39,
      "type": "total",
      "scoreboard": "S2",
      "total": 116,
      "overs": 19.3,
      "wickets": 10
    }
  ]
}
```

**Key Points:**
- Scoreboards are separate objects, not nested arrays
- `type: "total"` contains the actual match score
- `scoreboard: "S1"` = First innings, `"S2"` = Second innings
- No batting/bowling arrays inside scoreboards

---

## Recommendations

1. **Status Detection**: Use `status` field and `note` field, NOT `state_id`
2. **Result Extraction**: Parse `note` field for result text
3. **Score Extraction**: Use `scoreboards` array with `type: "total"`
4. **Batting/Bowling**: Must be fetched from separate endpoint or include parameter
5. **Completion Check**: `status === "Finished"` is the most reliable indicator





