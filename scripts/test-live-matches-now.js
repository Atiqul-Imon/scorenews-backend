const axios = require('axios');
require('dotenv').config();

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN is not set in environment variables');
  process.exit(1);
}

async function testLiveMatches() {
  try {
    console.log('🔍 Testing SportsMonk API Live Matches Endpoint\n');
    console.log(`API Token: ${SPORTSMONKS_API_TOKEN.substring(0, 10)}...`);
    console.log(`Base URL: ${SPORTSMONKS_BASE_URL}\n`);

    // Test 1: Direct API call to /livescores
    console.log('=== TEST 1: Direct /livescores Endpoint ===\n');
    const includeParam = 'scoreboards,localteam,visitorteam,venue';
    const url = `${SPORTSMONKS_BASE_URL}/livescores?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
    
    console.log(`📡 Fetching: ${url.replace(SPORTSMONKS_API_TOKEN, '***')}\n`);
    
    const response = await axios.get(url, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    console.log(`✅ Response Status: ${response.status}`);
    console.log(`📊 Response Structure:`);
    console.log(`   - Type: ${typeof response.data}`);
    console.log(`   - Keys: ${Object.keys(response.data || {}).join(', ')}`);

    // Parse matches
    let matches = [];
    if (Array.isArray(response.data?.data)) {
      matches = response.data.data;
    } else if (Array.isArray(response.data)) {
      matches = response.data;
    } else if (response.data?.data && typeof response.data.data === 'object') {
      matches = response.data.data.matches || response.data.data.data || [];
    }

    console.log(`\n📈 Found ${matches.length} match(es) in /livescores endpoint\n`);

    if (matches.length === 0) {
      console.log('⚠️  No live matches found in API response');
      console.log('   This could mean:');
      console.log('   1. There are genuinely no live matches right now');
      console.log('   2. API token has insufficient permissions');
      console.log('   3. API endpoint structure has changed\n');
    } else {
      console.log('✅ Live Matches Found:\n');
      matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`);
        console.log(`   ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State ID: ${match.state_id}`);
        console.log(`   Status: ${match.status || 'N/A'}`);
        console.log(`   Live: ${match.live}`);
        console.log(`   Starting At: ${match.starting_at || 'N/A'}`);
        console.log(`   Local Team: ${match.localteam?.name || 'N/A'}`);
        console.log(`   Visitor Team: ${match.visitorteam?.name || 'N/A'}`);
        if (match.scoreboards && match.scoreboards.length > 0) {
          console.log(`   Scoreboards: ${match.scoreboards.length} found`);
          match.scoreboards.forEach((sb, i) => {
            console.log(`      Scoreboard ${i + 1}: type=${sb.type}, score=${sb.score || 'N/A'}`);
          });
        }
        console.log('');
      });
    }

    // Test 2: Check backend endpoint
    console.log('\n=== TEST 2: Backend Endpoint ===\n');
    const backendUrl = process.env.API_URL || 'http://localhost:5000';
    console.log(`📡 Testing backend: ${backendUrl}/api/v1/cricket/matches/live\n`);

    try {
      const backendResponse = await axios.get(`${backendUrl}/api/v1/cricket/matches/live`, {
        timeout: 10000,
      });

      console.log(`✅ Backend Response Status: ${backendResponse.status}`);
      const backendData = backendResponse.data?.data || backendResponse.data || [];
      const backendMatches = Array.isArray(backendData) ? backendData : [];

      console.log(`📊 Backend returned ${backendMatches.length} match(es)\n`);

      if (backendMatches.length === 0 && matches.length > 0) {
        console.log('⚠️  ISSUE DETECTED: API has matches but backend returns none!');
        console.log('   Possible causes:');
        console.log('   1. Backend filtering logic is too strict');
        console.log('   2. Status determiner is excluding valid live matches');
        console.log('   3. Database sync issue');
        console.log('   4. Transformation logic is filtering out matches\n');
      } else if (backendMatches.length > 0) {
        console.log('✅ Backend is returning matches:');
        backendMatches.slice(0, 3).forEach((match, index) => {
          console.log(`   ${index + 1}. ${match.teams?.home?.name || 'T1'} vs ${match.teams?.away?.name || 'T2'} (${match.status})`);
        });
        console.log('');
      }
    } catch (backendError) {
      console.log(`❌ Backend test failed: ${backendError.message}`);
      if (backendError.code === 'ECONNREFUSED') {
        console.log('   Backend server is not running or not accessible');
      }
      console.log('');
    }

    // Test 3: Check database
    console.log('\n=== TEST 3: Database Check ===\n');
    console.log('To check database, you need to:');
    console.log('1. Connect to MongoDB');
    console.log('2. Query the live_matches collection');
    console.log('3. Check if matches from API are being stored\n');

    // Summary
    console.log('\n=== SUMMARY ===\n');
    if (matches.length === 0) {
      console.log('❌ No live matches in SportsMonk API');
      console.log('   → This is why nothing shows on the website');
      console.log('   → Either there are no live matches right now, or API issue');
    } else {
      console.log(`✅ Found ${matches.length} match(es) in API`);
      if (backendMatches && backendMatches.length === 0) {
        console.log('❌ But backend returns 0 matches');
        console.log('   → Backend filtering/transformation is the issue');
      } else if (backendMatches && backendMatches.length > 0) {
        console.log(`✅ Backend returns ${backendMatches.length} match(es)`);
        console.log('   → Check frontend filtering/display logic');
      }
    }

  } catch (error) {
    console.error('\n❌ Error testing live matches:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('   Cannot connect to API - check network/URL');
    }
  }
}

testLiveMatches();









