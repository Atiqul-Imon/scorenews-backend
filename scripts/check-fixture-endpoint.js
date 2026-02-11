/**
 * Check fixture endpoint to see actual match status from API
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const MATCH_ID = '68523'; // England vs West Indies

if (!API_TOKEN) {
  console.error('❌ SPORTSMONKS_API_TOKEN not found');
  process.exit(1);
}

async function checkFixtureEndpoint() {
  console.log('🔍 Checking Fixture Endpoint for Match 68523 (England vs West Indies)\n');
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  // Wait to avoid rate limiting
  console.log('⏳ Waiting 20 seconds for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  try {
    // Test 1: Check /fixtures/{id} endpoint with minimal includes
    console.log('Test 1: Checking /fixtures/{id} endpoint with minimal includes...\n');
    const fixturesUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,venue`;
    
    console.log(`URL: ${fixturesUrl.replace(API_TOKEN, '***')}\n`);
    
    const response = await axios.get(fixturesUrl, { 
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (response.data?.status === 'error') {
      console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      return;
    }
    
    const match = response.data?.data;
    if (!match) {
      console.log('❌ No match data returned');
      return;
    }
    
    console.log('✅ Match found in /fixtures endpoint\n');
    console.log('=== MATCH DETAILS ===');
    console.log('ID:', match.id);
    console.log('Name:', match.name);
    console.log('State ID:', match.state_id);
    console.log('Status:', match.status);
    console.log('Live:', match.live);
    console.log('Note:', match.note);
    console.log('Starting At:', match.starting_at);
    console.log('Result Info:', match.result_info);
    console.log('Round:', match.round);
    console.log('Stage:', match.stage);
    
    // Check teams
    if (match.localteam) {
      console.log('\n=== HOME TEAM ===');
      console.log('ID:', match.localteam.id);
      console.log('Name:', match.localteam.name);
      console.log('Code:', match.localteam.code);
    }
    
    if (match.visitorteam) {
      console.log('\n=== AWAY TEAM ===');
      console.log('ID:', match.visitorteam.id);
      console.log('Name:', match.visitorteam.name);
      console.log('Code:', match.visitorteam.code);
    }
    
    // Determine status based on our logic
    console.log('\n=== STATUS DETERMINATION ===');
    let determinedStatus = 'unknown';
    let reason = '';
    let confidence = 'low';
    
    // Priority 1: state_id
    if (match.state_id !== undefined) {
      if (match.state_id === 5 || match.state_id === 6) {
        determinedStatus = 'completed';
        confidence = 'high';
        reason = `state_id=${match.state_id} (5=finished, 6=abandoned)`;
      } else if (match.state_id === 3 || match.state_id === 4) {
        if (match.status && (match.status.includes('Finished') || match.status.includes('Completed'))) {
          determinedStatus = 'completed';
          confidence = 'high';
          reason = `state_id=${match.state_id} but status="${match.status}" indicates completion`;
        } else {
          determinedStatus = 'live';
          confidence = 'high';
          reason = `state_id=${match.state_id} (3=in progress, 4=break)`;
        }
      } else if (match.state_id === 1 || match.state_id === 2) {
        determinedStatus = 'upcoming';
        confidence = 'high';
        reason = `state_id=${match.state_id} (1=not started, 2=starting soon)`;
      }
    }
    
    // Priority 2: status field
    if (determinedStatus === 'unknown' && match.status) {
      if (match.status.includes('Finished') || match.status.includes('Completed') || match.status.includes('Result')) {
        determinedStatus = 'completed';
        confidence = 'high';
        reason = `status field="${match.status}" indicates completion`;
      } else if (match.status.toLowerCase().includes('innings') || 
                 match.status.toLowerCase().includes('live') || 
                 match.status.toLowerCase().includes('in progress')) {
        determinedStatus = 'live';
        confidence = 'high';
        reason = `status field="${match.status}" indicates live match`;
      }
    }
    
    // Priority 3: note field
    if (determinedStatus === 'unknown' && match.note) {
      const noteLower = match.note.toLowerCase();
      if (noteLower.includes('won by') || noteLower.includes('tied') || noteLower.includes('no result')) {
        determinedStatus = 'completed';
        confidence = 'high';
        reason = `note field contains result: "${match.note.substring(0, 50)}"`;
      }
    }
    
    // Priority 4: live field
    if (determinedStatus === 'unknown' && match.live === true) {
      if (match.status && (match.status.includes('Finished') || match.status.includes('Completed'))) {
        determinedStatus = 'completed';
        confidence = 'high';
        reason = `live=true but status="${match.status}" indicates completion (API inconsistency)`;
      } else {
        determinedStatus = 'live';
        confidence = 'medium';
        reason = 'live field is true';
      }
    }
    
    console.log(`Determined Status: ${determinedStatus.toUpperCase()} (${confidence} confidence)`);
    console.log(`Reason: ${reason}`);
    
    // Check if there's a mismatch
    if (determinedStatus === 'completed' && match.live === true) {
      console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
      console.log('   API has live: true BUT status indicates completed!');
      console.log('   This is why the match is showing as live in the database.');
    }
    
    if (determinedStatus === 'live' && (match.state_id === 5 || match.state_id === 6)) {
      console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
      console.log('   API has state_id indicating completed BUT status determiner says live!');
      console.log('   This suggests the status determination logic has a bug.');
    }
    
    // Wait before next test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Check with scoreboards
    console.log('\n\nTest 2: Checking /fixtures/{id} with scoreboards...\n');
    const fixturesWithScoreboardsUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue`;
    
    try {
      const scoreboardsResponse = await axios.get(fixturesWithScoreboardsUrl, { 
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (scoreboardsResponse.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(scoreboardsResponse.data.message, null, 2));
      } else {
        const matchWithScoreboards = scoreboardsResponse.data?.data;
        if (matchWithScoreboards) {
          console.log('✅ Match with scoreboards retrieved\n');
          console.log('State ID:', matchWithScoreboards.state_id);
          console.log('Status:', matchWithScoreboards.status);
          console.log('Live:', matchWithScoreboards.live);
          
          if (matchWithScoreboards.scoreboards && Array.isArray(matchWithScoreboards.scoreboards)) {
            console.log(`\nScoreboards: ${matchWithScoreboards.scoreboards.length} items`);
            matchWithScoreboards.scoreboards.forEach((sb, idx) => {
              console.log(`\n  Scoreboard ${idx + 1}:`);
              console.log('  Type:', sb.type);
              console.log('  Overs:', sb.overs);
              console.log('  Total:', sb.total);
              console.log('  Wickets:', sb.wickets);
              if (sb.batting) console.log(`  ✅ Has batting: ${Array.isArray(sb.batting) ? sb.batting.length + ' items' : 'not array'}`);
              if (sb.bowling) console.log(`  ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : 'not array'}`);
            });
          }
        }
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

checkFixtureEndpoint().catch(console.error);

