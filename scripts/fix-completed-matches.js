require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const MONGODB_URI = process.env.MONGODB_URI;

if (!SPORTSMONKS_API_TOKEN || !MONGODB_URI) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Simulate transformer logic
function determineStatus(apiMatch) {
  let status = 'upcoming';
  
  // Priority 1: Check status field for completed indicators
  if (apiMatch.status && (apiMatch.status.includes('Finished') || apiMatch.status.includes('Completed') || apiMatch.status.includes('Result'))) {
    status = 'completed';
  }
  // Priority 2: Check state_id
  else if (apiMatch.state_id !== undefined) {
    if (apiMatch.state_id === 5 || apiMatch.state_id === 6) {
      status = 'completed';
    } else if (apiMatch.state_id === 3 || apiMatch.state_id === 4) {
      status = 'live';
    } else if (apiMatch.state_id === 1 || apiMatch.state_id === 2) {
      status = 'upcoming';
    }
  }
  // Priority 3: Check for result/note field
  else if (apiMatch.note && (apiMatch.note.toLowerCase().includes('won by') || apiMatch.note.toLowerCase().includes('tied') || apiMatch.note.toLowerCase().includes('no result'))) {
    status = 'completed';
  }
  // Priority 4: Check live field
  else if (apiMatch.live === true) {
    status = 'live';
  }
  
  return status;
}

async function fetchMatchFromAPI(matchId) {
  const includeParam = 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season';
  const url = `${SPORTSMONKS_BASE_URL}/fixtures/${matchId}?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data;
}

// Create model once
let Match = null;
function getMatchModel() {
  if (!Match) {
    Match = mongoose.model('CricketMatch', new mongoose.Schema({}, { collection: 'cricket_matches', strict: false }));
  }
  return Match;
}

async function fixMatch(matchId, matchName) {
  try {
    console.log(`\n🔍 Fixing ${matchName} (Match ID: ${matchId})...`);
    
    // Fetch from API
    const apiMatch = await fetchMatchFromAPI(matchId);
    if (!apiMatch) {
      console.error(`❌ No match data returned from API for ${matchId}`);
      return false;
    }
    
    // Determine status
    const determinedStatus = determineStatus(apiMatch);
    console.log(`   API Status: ${apiMatch.status || 'N/A'}`);
    console.log(`   API Live: ${apiMatch.live !== undefined ? apiMatch.live : 'N/A'}`);
    console.log(`   API Note: ${apiMatch.note || 'N/A'}`);
    console.log(`   Determined Status: ${determinedStatus}`);
    
    if (determinedStatus !== 'completed') {
      console.log(`   ⚠️  Match is not completed according to API, skipping...`);
      return false;
    }
    
    // Get model
    const Match = getMatchModel();
    
    // Find match in database
    const dbMatch = await Match.findOne({ matchId: matchId });
    if (!dbMatch) {
      console.log(`   ⚠️  Match not found in database`);
      await mongoose.disconnect();
      return false;
    }
    
    console.log(`   Current DB Status: ${dbMatch.status}`);
    
    if (dbMatch.status === 'completed') {
      console.log(`   ✅ Match is already marked as completed in database`);
      return true;
    }
    
    // Parse result from note
    let result = null;
    if (apiMatch.note) {
      const note = apiMatch.note.toLowerCase();
      const winnerTeamId = apiMatch.winner_team_id;
      const localTeamId = apiMatch.localteam_id;
      const visitorTeamId = apiMatch.visitor_team_id;
      
      if (note.includes('won by')) {
        const isHomeWinner = winnerTeamId && winnerTeamId === localTeamId;
        const winnerName = isHomeWinner ? apiMatch.localteam?.name : apiMatch.visitorteam?.name;
        
        // Extract margin
        const runsMatch = apiMatch.note.match(/won by (\d+)\s+runs?/i);
        const wicketsMatch = apiMatch.note.match(/won by (\d+)\s+wickets?/i);
        
        let margin = 0;
        let marginType = 'runs';
        
        if (runsMatch) {
          margin = parseInt(runsMatch[1], 10);
          marginType = 'runs';
        } else if (wicketsMatch) {
          margin = parseInt(wicketsMatch[1], 10);
          marginType = 'wickets';
        }
        
        result = {
          winner: isHomeWinner ? 'home' : 'away',
          winnerName: winnerName,
          margin: margin,
          marginType: marginType,
          resultText: apiMatch.note,
          dataSource: 'api',
        };
      }
    }
    
    // Update match
    const updateData = {
      status: 'completed',
      matchEnded: true,
      endTime: dbMatch.endTime || new Date(),
      result: result || dbMatch.result,
      apiNote: apiMatch.note || dbMatch.apiNote,
      isCompleteData: true,
      apiFetchedAt: new Date(),
    };
    
    await Match.updateOne(
      { matchId: matchId },
      { $set: updateData }
    );
    
    console.log(`   ✅ Match updated to completed status`);
    if (result) {
      console.log(`   ✅ Result: ${result.resultText}`);
    }
    
    await mongoose.disconnect();
    return true;
    
  } catch (error) {
    console.error(`   ❌ Error fixing match ${matchId}:`, error.message);
    await mongoose.disconnect();
    return false;
  }
}

async function fixAllMatches() {
  try {
    // Connect to database once
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const matchesToFix = [
      { id: '69102', name: 'Sri Lanka vs England' },
      { id: '67847', name: 'Auckland Aces vs Canterbury Kings' },
    ];
    
    console.log('🔧 Fixing completed matches that are showing as live...\n');
    
    let fixed = 0;
    for (const match of matchesToFix) {
      const success = await fixMatch(match.id, match.name);
      if (success) fixed++;
    }
    
    console.log(`\n✅ Fixed ${fixed} out of ${matchesToFix.length} matches`);
    
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

fixAllMatches();

