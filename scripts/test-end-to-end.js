/**
 * End-to-end test: Check if matches are being fetched, transformed, and saved
 * Run: node scripts/test-end-to-end.js
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function testAPIResponse() {
  console.log('\n=== STEP 1: Test SportsMonks API Directly ===\n');
  
  try {
    const response = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });

    const matches = response.data?.data || [];
    console.log(`✅ API returned ${matches.length} matches\n`);

    if (matches.length > 0) {
      const irelandUAE = matches.find(m => 
        (m.localteam?.name?.toLowerCase().includes('ireland') && 
         m.visitorteam?.name?.toLowerCase().includes('united arab emirates')) ||
        (m.visitorteam?.name?.toLowerCase().includes('ireland') && 
         m.localteam?.name?.toLowerCase().includes('united arab emirates'))
      );

      if (irelandUAE) {
        console.log('✅ Ireland vs UAE match found in API:');
        console.log(JSON.stringify({
          id: irelandUAE.id,
          name: irelandUAE.name,
          status: irelandUAE.status,
          state_id: irelandUAE.state_id,
          live: irelandUAE.live,
          localteam: irelandUAE.localteam?.name,
          visitorteam: irelandUAE.visitorteam?.name,
          has_scoreboards: !!irelandUAE.scoreboards,
        }, null, 2));
        return irelandUAE;
      } else {
        console.log('⚠️  Ireland vs UAE not found. Available matches:');
        matches.forEach(m => {
          console.log(`  - ${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'} (id: ${m.id}, status: ${m.status})`);
        });
        return matches[0]; // Return first match for testing
      }
    } else {
      console.log('❌ No matches returned from API');
      return null;
    }
  } catch (error) {
    console.error('❌ API Error:', error.message);
    return null;
  }
}

async function testBackendEndpoint() {
  console.log('\n=== STEP 2: Test Backend Endpoint ===\n');
  
  try {
    console.log(`📡 Calling: ${BACKEND_URL}/api/v1/cricket/matches/live\n`);
    
    const response = await axios.get(`${BACKEND_URL}/api/v1/cricket/matches/live`, {
      timeout: 10000,
    });

    console.log('✅ Backend responded');
    console.log('Response structure:', {
      success: response.data?.success,
      hasData: !!response.data?.data,
      dataType: Array.isArray(response.data?.data) ? 'array' : typeof response.data?.data,
      dataLength: Array.isArray(response.data?.data) ? response.data.data.length : 'N/A',
    });

    if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
      console.log('\n✅ Backend returned matches:');
      response.data.data.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.teams?.home?.name || 'T1'} vs ${m.teams?.away?.name || 'T2'} (id: ${m.matchId}, status: ${m.status})`);
      });
      return response.data.data;
    } else {
      console.log('\n❌ Backend returned NO matches');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
      return [];
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Backend not running! Start it with: npm run start:dev');
    } else {
      console.error('❌ Backend Error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      }
    }
    return null;
  }
}

async function checkStatusDetermination(match) {
  console.log('\n=== STEP 3: Test Status Determination ===\n');
  
  // Simulate the status determiner logic
  const statusField = match.status || '';
  const liveField = match.live;
  const stateId = match.state_id;
  
  console.log('Match data:', {
    id: match.id,
    status: statusField,
    state_id: stateId,
    live: liveField,
  });

  // Check Priority 4: status field for live indicators
  const statusLower = statusField.toLowerCase();
  if (statusLower.includes('innings') || 
      statusLower.includes('live') || 
      statusLower.includes('in progress')) {
    console.log('✅ Status determiner would return: LIVE (high confidence)');
    console.log(`   Reason: status="${statusField}" indicates live`);
    return 'live';
  }

  // Check Priority 5: live field
  if (liveField === true) {
    console.log('✅ Status determiner would return: LIVE (medium confidence)');
    console.log('   Reason: live field is true');
    return 'live';
  }

  // Check Priority 1: state_id
  if (stateId === 3 || stateId === 4) {
    console.log('✅ Status determiner would return: LIVE (high confidence)');
    console.log(`   Reason: state_id=${stateId} (3=in progress, 4=break)`);
    return 'live';
  }

  console.log('❌ Status determiner would NOT return LIVE');
  return 'not-live';
}

// Run all tests
(async () => {
  const apiMatch = await testAPIResponse();
  
  if (apiMatch) {
    await checkStatusDetermination(apiMatch);
  }
  
  await testBackendEndpoint();
  
  console.log('\n=== SUMMARY ===\n');
  if (apiMatch) {
    console.log('✅ API has matches');
  } else {
    console.log('❌ API has no matches');
  }
  
  console.log('\nNext steps:');
  console.log('1. Check backend logs for processing errors');
  console.log('2. Verify database has matches: db.cricket_live_matches.find()');
  console.log('3. Check if transformer is failing silently');
})();

