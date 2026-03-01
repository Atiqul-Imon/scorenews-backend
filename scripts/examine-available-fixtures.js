/**
 * Examine SportsMonk API fixtures endpoint to see what data is provided
 * Check available matches instead of specific match ID
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!API_TOKEN) {
  console.error('❌ SPORTSMONKS_API_TOKEN not found');
  process.exit(1);
}

async function examineAvailableFixtures() {
  console.log('🔍 Examining SportsMonk API Fixtures Endpoint (Available Matches)\n');
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  // Wait to avoid rate limiting
  console.log('⏳ Waiting 30 seconds for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    // Test 1: Get recent fixtures
    console.log('='.repeat(80));
    console.log('TEST 1: Recent Fixtures (localteam,visitorteam,venue)');
    console.log('='.repeat(80));
    const fixturesUrl = `${BASE_URL}/fixtures?api_token=${API_TOKEN}&include=localteam,visitorteam,venue&per_page=5&sort=-starting_at`;
    
    try {
      const response = await axios.get(fixturesUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const fixtures = response.data?.data || [];
        console.log(`\n✅ Retrieved ${fixtures.length} fixtures\n`);
        
        if (fixtures.length > 0) {
          const match = fixtures[0];
          console.log('=== SAMPLE MATCH DATA ===');
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
          console.log('Type:', match.type);
          
          console.log('\n=== ALL TOP-LEVEL KEYS ===');
          console.log(Object.keys(match).join(', '));
          
          if (match.localteam) {
            console.log('\n=== HOME TEAM STRUCTURE ===');
            console.log('Keys:', Object.keys(match.localteam).join(', '));
            console.log('ID:', match.localteam.id);
            console.log('Name:', match.localteam.name);
            console.log('Code:', match.localteam.code);
          }
          
          if (match.visitorteam) {
            console.log('\n=== AWAY TEAM STRUCTURE ===');
            console.log('Keys:', Object.keys(match.visitorteam).join(', '));
            console.log('ID:', match.visitorteam.id);
            console.log('Name:', match.visitorteam.name);
            console.log('Code:', match.visitorteam.code);
          }
          
          if (match.venue) {
            console.log('\n=== VENUE STRUCTURE ===');
            console.log('Keys:', Object.keys(match.venue).join(', '));
            console.log('ID:', match.venue.id);
            console.log('Name:', match.venue.name);
            console.log('City:', match.venue.city);
            console.log('Country:', match.venue.country);
          }
          
          // Save first match to file
          const fs = require('fs');
          const filename = `sample-fixture-${match.id}.json`;
          fs.writeFileSync(filename, JSON.stringify(match, null, 2));
          console.log(`\n✅ Sample fixture data saved to: ${filename}`);
        }
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    // Wait before next test
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Get a completed match with scoreboards
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 2: Completed Match with Scoreboards');
    console.log('='.repeat(80));
    const completedUrl = `${BASE_URL}/fixtures?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue&per_page=5&sort=-starting_at&filters=state_id:5`;
    
    try {
      const response = await axios.get(completedUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const fixtures = response.data?.data || [];
        console.log(`\n✅ Retrieved ${fixtures.length} completed fixtures\n`);
        
        if (fixtures.length > 0) {
          const match = fixtures[0];
          console.log('=== COMPLETED MATCH DATA ===');
          console.log('ID:', match.id);
          console.log('Name:', match.name);
          console.log('State ID:', match.state_id);
          console.log('Status:', match.status);
          console.log('Live:', match.live);
          console.log('Note:', match.note);
          console.log('Result Info:', match.result_info);
          
          if (match.scoreboards && Array.isArray(match.scoreboards)) {
            console.log(`\n=== SCOREBOARDS (${match.scoreboards.length} items) ===`);
            match.scoreboards.forEach((sb, idx) => {
              console.log(`\nScoreboard ${idx + 1}:`);
              console.log('  All Keys:', Object.keys(sb).join(', '));
              console.log('  Type:', sb.type);
              console.log('  Overs:', sb.overs);
              console.log('  Total:', sb.total);
              console.log('  Wickets:', sb.wickets);
              console.log('  Runs:', sb.runs);
              console.log('  Team ID:', sb.team_id);
              
              if (sb.batting) {
                console.log(`  ✅ Has batting: ${Array.isArray(sb.batting) ? sb.batting.length + ' items' : typeof sb.batting}`);
                if (Array.isArray(sb.batting) && sb.batting.length > 0) {
                  const sample = sb.batting[0];
                  console.log('  Sample batting keys:', Object.keys(sample).join(', '));
                  console.log('  Sample batting data:', JSON.stringify(sample, null, 4));
                }
              }
              
              if (sb.bowling) {
                console.log(`  ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : typeof sb.bowling}`);
                if (Array.isArray(sb.bowling) && sb.bowling.length > 0) {
                  const sample = sb.bowling[0];
                  console.log('  Sample bowling keys:', Object.keys(sample).join(', '));
                  console.log('  Sample bowling data:', JSON.stringify(sample, null, 4));
                }
              }
            });
            
            // Save to file
            const fs = require('fs');
            const filename = `completed-match-${match.id}-with-scoreboards.json`;
            fs.writeFileSync(filename, JSON.stringify(match, null, 2));
            console.log(`\n✅ Completed match with scoreboards saved to: ${filename}`);
          } else {
            console.log('\n❌ No scoreboards in this match');
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
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
  }
}

examineAvailableFixtures().catch(console.error);





