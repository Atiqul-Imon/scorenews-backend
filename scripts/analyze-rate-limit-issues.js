const fs = require('fs');
const path = require('path');

console.log('=== RATE LIMIT ISSUE ANALYSIS ===\n');

console.log('🔴 CRITICAL ISSUE #1: getMatchDetails() makes 2 API calls per request!');
console.log('   Location: sportsmonks.service.ts:361');
console.log('   - First call: /livescores endpoint (line 380)');
console.log('   - Second call: /fixtures/{id} endpoint (line 429)');
console.log('   Impact: Every match detail request = 2 API calls\n');

console.log('🔴 CRITICAL ISSUE #2: Player enrichment makes parallel API calls!');
console.log('   Location: live-match.service.ts:338-353');
console.log('   - Uses Promise.all() to fetch ALL players in parallel');
console.log('   - If 20 players need names = 20 simultaneous API calls');
console.log('   - Called for EVERY match during background updates');
console.log('   Impact: 3 matches × 20 players = 60 API calls in seconds!\n');

console.log('🔴 CRITICAL ISSUE #3: Cache busters prevent Redis caching!');
console.log('   Location: sportsmonks.service.ts:385, 434, 479, 650, 670');
console.log('   - Uses _t: timestamp parameter');
console.log('   - Prevents Redis cache from working');
console.log('   Impact: Every request hits API directly\n');

console.log('🔴 CRITICAL ISSUE #4: Transition service calls getMatchDetails for every match!');
console.log('   Location: match-transition.service.ts:106');
console.log('   - Checks every live match individually');
console.log('   - Each check = 2 API calls (livescores + fixtures)');
console.log('   - Runs every 2 minutes');
console.log('   Impact: 3 matches × 2 calls = 6 API calls every 2 minutes\n');

console.log('=== API CALL CALCULATION ===\n');

console.log('Scenario: 3 live matches, 20 players each without names\n');

console.log('1. Background update (every 60s):');
console.log('   - getLiveMatches(): 1 call');
console.log('   - Player enrichment: 3 matches × 20 players = 60 calls');
console.log('   Total: 61 calls per update = 3,660 calls/hour\n');

console.log('2. Transition check (every 2 minutes):');
console.log('   - getMatchDetails() × 3 matches = 6 calls (2 per match)');
console.log('   Total: 6 calls per check = 180 calls/hour\n');

console.log('3. User requests (variable):');
console.log('   - Match detail page: 2 calls per request');
console.log('   - Commentary: 1-2 calls per request');
console.log('   - Could easily be 50-100+ calls/hour during peak\n');

console.log('TOTAL: ~4,000+ API calls/hour (WAY over limit!)\n');

console.log('=== SOLUTIONS ===\n');

console.log('✅ FIX #1: Remove /livescores call from getMatchDetails()');
console.log('   - Only use /fixtures/{id} endpoint');
console.log('   - Saves 1 API call per match detail request\n');

console.log('✅ FIX #2: Disable player enrichment during background updates');
console.log('   - Only enrich when user requests match details');
console.log('   - Or add delays between player API calls');
console.log('   - Saves 60+ API calls per background update\n');

console.log('✅ FIX #3: Remove cache busters');
console.log('   - Remove _t: timestamp parameters');
console.log('   - Let Redis cache work (30s TTL)');
console.log('   - Reduces API calls by 50-70%\n');

console.log('✅ FIX #4: Batch transition checks');
console.log('   - Check all matches from /livescores first');
console.log('   - Only call getMatchDetails for matches that need it');
console.log('   - Saves 50% of transition API calls\n');

console.log('=== EXPECTED IMPROVEMENT ===\n');
console.log('Before: ~4,000 calls/hour');
console.log('After: ~200-300 calls/hour');
console.log('Reduction: 90%+ reduction in API calls!');



