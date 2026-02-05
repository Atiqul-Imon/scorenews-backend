require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN not found in environment variables');
  process.exit(1);
}

async function checkMatch(matchId, matchName) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Checking ${matchName} (Match ID: ${matchId})`);
    console.log('='.repeat(80));

    // Check fixture endpoint
    const includeParam = 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season';
    const url = `${SPORTSMONKS_BASE_URL}/fixtures/${matchId}?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
    
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

    console.log('\n📋 API RAW DATA:');
    console.log(`   Status: ${apiMatch.status || 'N/A'}`);
    console.log(`   Live: ${apiMatch.live !== undefined ? apiMatch.live : 'N/A'}`);
    console.log(`   State ID: ${apiMatch.state_id !== undefined ? apiMatch.state_id : 'N/A'}`);
    console.log(`   Note: ${apiMatch.note || 'N/A'}`);
    console.log(`   Teams: ${apiMatch.localteam?.name} vs ${apiMatch.visitorteam?.name}`);

    // Simulate transformer logic
    let status = 'upcoming';
    
    // Priority 1: Check status field for completed indicators
    if (apiMatch.status && (apiMatch.status.includes('Finished') || apiMatch.status.includes('Completed') || apiMatch.status.includes('Result'))) {
      status = 'completed';
      console.log('\n✅ Status determined: COMPLETED (Priority 1: status field)');
    }
    // Priority 2: Check state_id
    else if (apiMatch.state_id !== undefined) {
      if (apiMatch.state_id === 5 || apiMatch.state_id === 6) {
        status = 'completed';
        console.log('\n✅ Status determined: COMPLETED (Priority 2: state_id)');
      } else if (apiMatch.state_id === 3 || apiMatch.state_id === 4) {
        status = 'live';
        console.log('\n⚠️  Status determined: LIVE (Priority 2: state_id)');
      } else if (apiMatch.state_id === 1 || apiMatch.state_id === 2) {
        status = 'upcoming';
        console.log('\n⚠️  Status determined: UPCOMING (Priority 2: state_id)');
      }
    }
    // Priority 3: Check for result/note field
    else if (apiMatch.note && (apiMatch.note.toLowerCase().includes('won by') || apiMatch.note.toLowerCase().includes('tied') || apiMatch.note.toLowerCase().includes('no result'))) {
      status = 'completed';
      console.log('\n✅ Status determined: COMPLETED (Priority 3: note field)');
    }
    // Priority 4: Check live field
    else if (apiMatch.live === true) {
      status = 'live';
      console.log('\n⚠️  Status determined: LIVE (Priority 4: live field)');
    }

    console.log(`\n📊 FINAL DETERMINED STATUS: ${status.toUpperCase()}`);
    
    if (status === 'completed' && apiMatch.live === true) {
      console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
      console.log('   API has live: true BUT status indicates completed!');
      console.log('   This is why the match is showing as live in the database.');
    }
    
  } catch (error) {
    console.error(`❌ Error checking match ${matchId}:`, error.message);
  }
}

async function checkBothMatches() {
  await checkMatch('69102', 'Sri Lanka vs England');
  await checkMatch('67847', 'Auckland Aces vs Canterbury Kings');
  console.log('\n✅ Check complete!');
}

checkBothMatches();










