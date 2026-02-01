/**
 * Test script to examine SportsMonks v2 API response structure
 * Run: node scripts/test-sportsmonks-api.js
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function testLivescoresEndpoint() {
  console.log('\n=== TESTING LIVESCORES ENDPOINT ===\n');
  
  if (!API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found in .env file');
    process.exit(1);
  }

  try {
    const endpoint = `${BASE_URL}/livescores`;
    const includeParam = 'scoreboards,localteam,visitorteam,venue';
    
    console.log(`📡 Calling: ${endpoint}`);
    console.log(`📋 Include: ${includeParam}`);
    console.log(`🔑 Token: ${API_TOKEN.substring(0, 10)}...\n`);

    const response = await axios.get(endpoint, {
      params: {
        api_token: API_TOKEN,
        include: includeParam,
      },
      timeout: 10000,
    });

    console.log('✅ API Call Successful!\n');
    console.log('📊 Response Status:', response.status);
    console.log('📦 Response Structure:', {
      hasData: !!response.data?.data,
      dataType: Array.isArray(response.data?.data) ? 'array' : typeof response.data?.data,
      dataLength: Array.isArray(response.data?.data) ? response.data.data.length : 'N/A',
    });

    if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
      const firstMatch = response.data.data[0];
      
      console.log('\n=== FIRST MATCH STRUCTURE ===\n');
      console.log(JSON.stringify({
        id: firstMatch.id,
        name: firstMatch.name,
        state_id: firstMatch.state_id,
        status: firstMatch.status,
        starting_at: firstMatch.starting_at,
        ending_at: firstMatch.ending_at,
        localteam_id: firstMatch.localteam_id,
        visitorteam_id: firstMatch.visitorteam_id,
        note: firstMatch.note,
        live: firstMatch.live,
        has_localteam: !!firstMatch.localteam,
        has_visitorteam: !!firstMatch.visitorteam,
        has_venue: !!firstMatch.venue,
        has_scoreboards: !!firstMatch.scoreboards,
        scoreboards_count: firstMatch.scoreboards?.length || 0,
      }, null, 2));

      if (firstMatch.localteam) {
        console.log('\n=== LOCALTEAM STRUCTURE ===\n');
        console.log(JSON.stringify({
          id: firstMatch.localteam.id,
          name: firstMatch.localteam.name,
          short_name: firstMatch.localteam.short_name,
          image_path: firstMatch.localteam.image_path,
          all_keys: Object.keys(firstMatch.localteam),
        }, null, 2));
      }

      if (firstMatch.visitorteam) {
        console.log('\n=== VISITORTEAM STRUCTURE ===\n');
        console.log(JSON.stringify({
          id: firstMatch.visitorteam.id,
          name: firstMatch.visitorteam.name,
          short_name: firstMatch.visitorteam.short_name,
          image_path: firstMatch.visitorteam.image_path,
          all_keys: Object.keys(firstMatch.visitorteam),
        }, null, 2));
      }

      if (firstMatch.scoreboards && firstMatch.scoreboards.length > 0) {
        console.log('\n=== SCOREBOARDS STRUCTURE ===\n');
        firstMatch.scoreboards.slice(0, 3).forEach((scoreboard, index) => {
          console.log(`\nScoreboard ${index + 1}:`);
          console.log(JSON.stringify({
            id: scoreboard.id,
            scoreboard: scoreboard.scoreboard,
            team_id: scoreboard.team_id,
            type: scoreboard.type,
            total: scoreboard.total,
            wickets: scoreboard.wickets,
            overs: scoreboard.overs,
            all_keys: Object.keys(scoreboard),
          }, null, 2));
        });
      }

      if (firstMatch.venue) {
        console.log('\n=== VENUE STRUCTURE ===\n');
        console.log(JSON.stringify({
          id: firstMatch.venue.id,
          name: firstMatch.venue.name,
          city: firstMatch.venue.city,
          country: firstMatch.venue.country,
          all_keys: Object.keys(firstMatch.venue),
        }, null, 2));
      }

      // Show ALL keys in first match to see what we might be missing
      console.log('\n=== ALL KEYS IN FIRST MATCH ===\n');
      console.log(Object.keys(firstMatch).join(', '));

      // Check for Ireland vs UAE specifically
      const irelandUAE = response.data.data.find(m => 
        (m.localteam?.name?.toLowerCase().includes('ireland') && 
         m.visitorteam?.name?.toLowerCase().includes('united arab emirates')) ||
        (m.visitorteam?.name?.toLowerCase().includes('ireland') && 
         m.localteam?.name?.toLowerCase().includes('united arab emirates')) ||
        m.name?.toLowerCase().includes('ireland') && m.name?.toLowerCase().includes('united arab emirates')
      );

      if (irelandUAE) {
        console.log('\n=== IRELAND VS UAE MATCH FOUND ===\n');
        console.log(JSON.stringify({
          id: irelandUAE.id,
          name: irelandUAE.name,
          state_id: irelandUAE.state_id,
          status: irelandUAE.status,
          localteam: irelandUAE.localteam?.name,
          visitorteam: irelandUAE.visitorteam?.name,
          has_scoreboards: !!irelandUAE.scoreboards,
          scoreboards_count: irelandUAE.scoreboards?.length || 0,
        }, null, 2));
      } else {
        console.log('\n⚠️  Ireland vs UAE match not found in response');
        console.log('Available matches:');
        response.data.data.forEach((m, i) => {
          console.log(`  ${i + 1}. ${m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`} (id: ${m.id}, state_id: ${m.state_id})`);
        });
      }

    } else {
      console.log('\n⚠️  No matches returned from API');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error calling API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

async function testFixturesEndpoint() {
  console.log('\n\n=== TESTING FIXTURES ENDPOINT (FALLBACK) ===\n');
  
  try {
    const endpoint = `${BASE_URL}/fixtures`;
    const includeParam = 'scoreboards,localteam,visitorteam,venue';
    
    console.log(`📡 Calling: ${endpoint}`);
    console.log(`📋 Include: ${includeParam}\n`);

    const response = await axios.get(endpoint, {
      params: {
        api_token: API_TOKEN,
        include: includeParam,
        per_page: 50,
      },
      timeout: 10000,
    });

    const allFixtures = response.data?.data || [];
    console.log(`✅ Fixtures endpoint returned ${allFixtures.length} matches\n`);

    // Filter for live matches (state_id 3 or 4)
    const liveMatches = allFixtures.filter(m => m.state_id === 3 || m.state_id === 4);
    console.log(`📊 Found ${liveMatches.length} live matches (state_id 3 or 4)\n`);

    if (liveMatches.length > 0) {
      console.log('Live matches:');
      liveMatches.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`} (id: ${m.id}, state_id: ${m.state_id})`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error calling fixtures endpoint:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run tests
(async () => {
  await testLivescoresEndpoint();
  await testFixturesEndpoint();
})();



