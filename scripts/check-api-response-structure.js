const axios = require('axios');
require('dotenv').config();

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN is not set');
  process.exit(1);
}

async function checkAPIResponse() {
  try {
    console.log('🔍 Checking API Response Structure\n');

    // Test 1: Livescores endpoint
    console.log('=== TEST 1: /livescores Endpoint ===\n');
    const livescoresUrl = `${SPORTSMONKS_BASE_URL}/livescores?api_token=${SPORTSMONKS_API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`;
    const livescoresRes = await axios.get(livescoresUrl);
    
    console.log('Response keys:', Object.keys(livescoresRes.data));
    console.log('Data type:', typeof livescoresRes.data.data);
    console.log('Data is array:', Array.isArray(livescoresRes.data.data));
    console.log('Data length:', Array.isArray(livescoresRes.data.data) ? livescoresRes.data.data.length : 'N/A');
    
    if (livescoresRes.data.data && Array.isArray(livescoresRes.data.data) && livescoresRes.data.data.length > 0) {
      console.log('\nFirst match structure:');
      console.log(JSON.stringify(livescoresRes.data.data[0], null, 2));
    } else {
      console.log('\n⚠️  No matches in livescores endpoint');
    }

    // Test 2: Fixtures endpoint (to see if there are matches starting soon)
    console.log('\n=== TEST 2: /fixtures Endpoint (Next 10) ===\n');
    const fixturesUrl = `${SPORTSMONKS_BASE_URL}/fixtures?api_token=${SPORTSMONKS_API_TOKEN}&include=localteam,visitorteam,scoreboards&per_page=10`;
    const fixturesRes = await axios.get(fixturesUrl);
    
    const fixtures = fixturesRes.data?.data || [];
    console.log(`Found ${fixtures.length} fixtures\n`);
    
    if (fixtures.length > 0) {
      console.log('Upcoming fixtures:');
      fixtures.slice(0, 5).forEach((fixture, i) => {
        const startTime = fixture.starting_at ? new Date(fixture.starting_at) : null;
        const isPast = startTime && startTime < new Date();
        const isToday = startTime && startTime.toDateString() === new Date().toDateString();
        
        console.log(`\n${i + 1}. ${fixture.localteam?.name || 'T1'} vs ${fixture.visitorteam?.name || 'T2'}`);
        console.log(`   ID: ${fixture.id}`);
        console.log(`   State ID: ${fixture.state_id}`);
        console.log(`   Status: ${fixture.status || 'N/A'}`);
        console.log(`   Starting: ${startTime ? startTime.toLocaleString() : 'N/A'}`);
        console.log(`   Is Past: ${isPast}`);
        console.log(`   Is Today: ${isToday}`);
        console.log(`   Has Scoreboards: ${fixture.scoreboards?.length > 0}`);
      });
    }

    // Test 3: Check if there are matches with state_id that might be live
    console.log('\n=== TEST 3: Checking State IDs ===\n');
    console.log('Common state_id values:');
    console.log('  1 = Not Started');
    console.log('  2 = In Progress (Live)');
    console.log('  3 = Finished');
    console.log('  4 = Cancelled');
    console.log('  5 = Abandoned');
    console.log('  6 = Interrupted');
    console.log('  7 = Postponed\n');

    if (fixtures.length > 0) {
      const stateCounts = {};
      fixtures.forEach(f => {
        const state = f.state_id || 'unknown';
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      });
      console.log('State ID distribution in fixtures:');
      Object.entries(stateCounts).forEach(([state, count]) => {
        console.log(`  State ${state}: ${count} match(es)`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkAPIResponse();


