const fs = require('fs');
const path = require('path');

console.log('=== API Call Pattern Analysis ===\n');

// Read the service files
const servicesDir = path.join(__dirname, '../src/modules/cricket/services');
const files = [
  'live-match.service.ts',
  'sportsmonks.service.ts',
  'match-transition.service.ts',
  'match-scheduler.service.ts',
];

const apiCalls = [];

files.forEach(file => {
  const filePath = path.join(servicesDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find all API calls
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Check for getLiveMatches, getMatchDetails, getPlayerDetails
      if (line.includes('getLiveMatches') || 
          line.includes('getMatchDetails') || 
          line.includes('getPlayerDetails') ||
          line.includes('getCommentary')) {
        apiCalls.push({
          file,
          line: idx + 1,
          code: line.trim(),
        });
      }
      
      // Check for Promise.all (parallel calls)
      if (line.includes('Promise.all')) {
        apiCalls.push({
          file,
          line: idx + 1,
          code: line.trim(),
          note: '⚠️  PARALLEL API CALLS - Could cause rate limiting!',
        });
      }
      
      // Check for cache busters
      if (line.includes('_t:') || line.includes('timestamp') || line.includes('Date.now()')) {
        if (line.includes('params') || line.includes('api_token')) {
          apiCalls.push({
            file,
            line: idx + 1,
            code: line.trim(),
            note: '⚠️  CACHE BUSTER - Prevents Redis caching!',
          });
        }
      }
    });
  }
});

console.log('=== API Calls Found ===\n');
apiCalls.forEach(call => {
  console.log(`File: ${call.file}`);
  console.log(`Line: ${call.line}`);
  console.log(`Code: ${call.code}`);
  if (call.note) {
    console.log(`${call.note}`);
  }
  console.log('');
});

// Count by type
const getLiveMatchesCount = apiCalls.filter(c => c.code.includes('getLiveMatches')).length;
const getMatchDetailsCount = apiCalls.filter(c => c.code.includes('getMatchDetails')).length;
const getPlayerDetailsCount = apiCalls.filter(c => c.code.includes('getPlayerDetails')).length;
const parallelCallsCount = apiCalls.filter(c => c.note && c.note.includes('PARALLEL')).length;
const cacheBustersCount = apiCalls.filter(c => c.note && c.note.includes('CACHE BUSTER')).length;

console.log('=== Summary ===');
console.log(`getLiveMatches calls: ${getLiveMatchesCount}`);
console.log(`getMatchDetails calls: ${getMatchDetailsCount}`);
console.log(`getPlayerDetails calls: ${getPlayerDetailsCount}`);
console.log(`Parallel API calls: ${parallelCallsCount}`);
console.log(`Cache busters: ${cacheBustersCount}`);
console.log('');

// Calculate potential API calls per hour
console.log('=== Potential API Calls Per Hour ===');
console.log('Scheduler (every 60s): 60 calls/hour (getLiveMatches)');
console.log('Transition (every 2min, 3 matches): 90 calls/hour (getMatchDetails)');
console.log('Player enrichment (3 matches, 20 players each): 60 calls/hour (getPlayerDetails)');
console.log('Total: ~210 calls/hour');
console.log('');
console.log('⚠️  ISSUE: Player enrichment is making MANY parallel API calls!');
console.log('⚠️  ISSUE: getMatchDetails calls /livescores first, then /fixtures/{id} (2 calls per request)!');
console.log('⚠️  ISSUE: Cache busters prevent Redis caching!');



