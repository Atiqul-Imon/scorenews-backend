/**
 * Check England vs West Indies match status from API
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

async function checkMatch() {
  console.log('🔍 Checking England vs West Indies Match (ID: 68523)\n');
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  try {
    // Wait to avoid rate limiting
    console.log('⏳ Waiting 10 seconds for rate limit to reset...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check /livescores endpoint first
    console.log('Test 1: Checking /livescores endpoint...\n');
    const livescoresUrl = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`;
    const livescoresResponse = await axios.get(livescoresUrl, { timeout: 10000 });
    
    if (livescoresResponse.data?.status === 'error') {
      console.log('❌ Livescores Error:', JSON.stringify(livescoresResponse.data.message, null, 2));
    } else {
      const matches = livescoresResponse.data?.data || [];
      const match = matches.find(m => m.id?.toString() === MATCH_ID);
      
      if (match) {
        console.log('✅ Match found in /livescores endpoint\n');
        console.log('Match Details:');
        console.log('  ID:', match.id);
        console.log('  Name:', match.name);
        console.log('  State ID:', match.state_id);
        console.log('  Status:', match.status);
        console.log('  Live:', match.live);
        console.log('  Note:', match.note);
        console.log('  Starting At:', match.starting_at);
      } else {
        console.log('❌ Match NOT found in /livescores (might be completed)\n');
      }
    }
    
    // Wait before next request
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check /fixtures endpoint
    console.log('\n\nTest 2: Checking /fixtures endpoint...\n');
    const fixturesUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue`;
    const fixturesResponse = await axios.get(fixturesUrl, { timeout: 10000 });
    
    if (fixturesResponse.data?.status === 'error') {
      console.log('❌ Fixtures Error:', JSON.stringify(fixturesResponse.data.message, null, 2));
    } else {
      const match = fixturesResponse.data?.data;
      if (match) {
        console.log('✅ Match found in /fixtures endpoint\n');
        console.log('Match Details:');
        console.log('  ID:', match.id);
        console.log('  Name:', match.name);
        console.log('  State ID:', match.state_id);
        console.log('  Status:', match.status);
        console.log('  Live:', match.live);
        console.log('  Note:', match.note);
        console.log('  Starting At:', match.starting_at);
        console.log('  Result Info:', match.result_info);
        
        // Determine status
        console.log('\n📊 Status Determination:');
        let determinedStatus = 'unknown';
        let reason = '';
        
        if (match.state_id === 5 || match.state_id === 6) {
          determinedStatus = 'completed';
          reason = `state_id=${match.state_id} (5=finished, 6=abandoned)`;
        } else if (match.state_id === 3 || match.state_id === 4) {
          if (match.status && (match.status.includes('Finished') || match.status.includes('Completed'))) {
            determinedStatus = 'completed';
            reason = `state_id=${match.state_id} but status="${match.status}" indicates completion`;
          } else {
            determinedStatus = 'live';
            reason = `state_id=${match.state_id} (3=in progress, 4=break)`;
          }
        } else if (match.status && (match.status.includes('Finished') || match.status.includes('Completed') || match.status.includes('Result'))) {
          determinedStatus = 'completed';
          reason = `status field="${match.status}" indicates completion`;
        } else if (match.note && (match.note.toLowerCase().includes('won by') || match.note.toLowerCase().includes('tied'))) {
          determinedStatus = 'completed';
          reason = `note field contains result: "${match.note.substring(0, 50)}"`;
        } else if (match.live === true) {
          determinedStatus = 'live';
          reason = 'live field is true';
        }
        
        console.log(`  Determined Status: ${determinedStatus.toUpperCase()}`);
        console.log(`  Reason: ${reason}`);
        
        if (determinedStatus === 'completed' && match.live === true) {
          console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
          console.log('   API has live: true BUT status indicates completed!');
          console.log('   This is why the match is showing as live in the database.');
        }
      } else {
        console.log('❌ Match not found in /fixtures endpoint');
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

checkMatch().catch(console.error);



