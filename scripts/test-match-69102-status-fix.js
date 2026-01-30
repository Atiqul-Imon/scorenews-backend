require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const MONGODB_URI = process.env.MONGODB_URI;

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN not found in environment variables');
  process.exit(1);
}

// Simulate the transformer logic for status detection
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

async function testMatchStatus() {
  try {
    const matchId = '69102';
    console.log('🔍 Testing match 69102 status detection...\n');

    // Fetch from fixture endpoint
    const includeParam = 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season';
    const url = `${SPORTSMONKS_BASE_URL}/fixtures/${matchId}?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
    
    console.log('📡 Fetching from API...');
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const apiMatch = data.data;

    if (!apiMatch) {
      console.error('❌ No match data returned from API');
      return;
    }

    console.log('\n═'.repeat(80));
    console.log('📋 API RAW DATA:');
    console.log('═'.repeat(80));
    console.log(`   Status: ${apiMatch.status || 'N/A'}`);
    console.log(`   Live: ${apiMatch.live !== undefined ? apiMatch.live : 'N/A'}`);
    console.log(`   State ID: ${apiMatch.state_id !== undefined ? apiMatch.state_id : 'N/A'}`);
    console.log(`   Note: ${apiMatch.note || 'N/A'}`);

    // Determine status using our logic
    console.log('\n🔄 Determining status using new logic...');
    const determinedStatus = determineStatus(apiMatch);

    console.log('\n═'.repeat(80));
    console.log('✅ STATUS DETERMINATION RESULT:');
    console.log('═'.repeat(80));
    console.log(`   Determined Status: ${determinedStatus}`);
    console.log(`   Teams: ${apiMatch.localteam?.name} vs ${apiMatch.visitorteam?.name}`);

    // Check database
    if (MONGODB_URI) {
      console.log('\n📊 Checking database...');
      await mongoose.connect(MONGODB_URI);
      
      const Match = mongoose.model('CricketMatch', new mongoose.Schema({}, { collection: 'cricket_matches', strict: false }));
      const dbMatch = await Match.findOne({ matchId: matchId });
      
      if (dbMatch) {
        console.log(`   Database Status: ${dbMatch.status}`);
        console.log(`   Database Match Ended: ${dbMatch.matchEnded}`);
        console.log(`   Database Result: ${dbMatch.result ? JSON.stringify(dbMatch.result).substring(0, 150) : 'N/A'}`);
        
        // Compare
        if (determinedStatus === 'completed' && dbMatch.status === 'live') {
          console.log('\n⚠️  MISMATCH: New logic says completed but database says live');
          console.log('   This match needs to be updated in the database.');
          console.log('\n💡 To fix: The next time this match is fetched from API, it will be updated automatically.');
        } else if (determinedStatus === dbMatch.status) {
          console.log('\n✅ Status matches between new logic and database');
        }
      } else {
        console.log('   Match not found in database');
      }
      
      await mongoose.disconnect();
    }

    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Error testing match status:', error.message);
    console.error(error.stack);
  }
}

testMatchStatus();

