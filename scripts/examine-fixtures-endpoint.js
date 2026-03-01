/**
 * Examine SportsMonk API fixtures endpoint to see what data is provided
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

async function examineFixturesEndpoint() {
  console.log('🔍 Examining SportsMonk API Fixtures Endpoint\n');
  console.log(`Match ID: ${MATCH_ID}`);
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  // Wait to avoid rate limiting
  console.log('⏳ Waiting 30 seconds for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    // Test 1: Minimal includes
    console.log('='.repeat(80));
    console.log('TEST 1: Minimal Includes (localteam,visitorteam,venue)');
    console.log('='.repeat(80));
    const minimalUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,venue`;
    
    try {
      const response = await axios.get(minimalUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const match = response.data?.data;
        if (match) {
          console.log('\n✅ Match Data Retrieved\n');
          console.log('=== BASIC INFO ===');
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
          
          if (match.localteam) {
            console.log('\n=== HOME TEAM ===');
            console.log('ID:', match.localteam.id);
            console.log('Name:', match.localteam.name);
            console.log('Code:', match.localteam.code);
            console.log('Image Path:', match.localteam.image_path);
          }
          
          if (match.visitorteam) {
            console.log('\n=== AWAY TEAM ===');
            console.log('ID:', match.visitorteam.id);
            console.log('Name:', match.visitorteam.name);
            console.log('Code:', match.visitorteam.code);
            console.log('Image Path:', match.visitorteam.image_path);
          }
          
          if (match.venue) {
            console.log('\n=== VENUE ===');
            console.log('ID:', match.venue.id);
            console.log('Name:', match.venue.name);
            console.log('City:', match.venue.city);
            console.log('Country:', match.venue.country);
          }
          
          // Show all top-level keys
          console.log('\n=== ALL TOP-LEVEL KEYS ===');
          console.log(Object.keys(match).join(', '));
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
    
    // Test 2: With scoreboards
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 2: With Scoreboards (localteam,visitorteam,scoreboards,venue)');
    console.log('='.repeat(80));
    const scoreboardsUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue`;
    
    try {
      const response = await axios.get(scoreboardsUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const match = response.data?.data;
        if (match) {
          console.log('\n✅ Match Data with Scoreboards Retrieved\n');
          console.log('State ID:', match.state_id);
          console.log('Status:', match.status);
          console.log('Live:', match.live);
          console.log('Note:', match.note);
          
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
                }
              }
              
              if (sb.bowling) {
                console.log(`  ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : typeof sb.bowling}`);
                if (Array.isArray(sb.bowling) && sb.bowling.length > 0) {
                  const sample = sb.bowling[0];
                  console.log('  Sample bowling keys:', Object.keys(sample).join(', '));
                }
              }
            });
          } else {
            console.log('\n❌ No scoreboards or not an array');
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
    
    // Wait before next test
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 3: With league and season
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 3: With League and Season (localteam,visitorteam,venue,league,season)');
    console.log('='.repeat(80));
    const leagueUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,venue,league,season`;
    
    try {
      const response = await axios.get(leagueUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const match = response.data?.data;
        if (match) {
          console.log('\n✅ Match Data with League/Season Retrieved\n');
          console.log('State ID:', match.state_id);
          console.log('Status:', match.status);
          console.log('Live:', match.live);
          console.log('Note:', match.note);
          
          if (match.league) {
            console.log('\n=== LEAGUE ===');
            console.log('ID:', match.league.id);
            console.log('Name:', match.league.name);
            console.log('Type:', match.league.type);
            console.log('All Keys:', Object.keys(match.league).join(', '));
          }
          
          if (match.season) {
            console.log('\n=== SEASON ===');
            console.log('ID:', match.season.id);
            console.log('Name:', match.season.name);
            console.log('All Keys:', Object.keys(match.season).join(', '));
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
    
    // Test 4: Full data structure (save to file for inspection)
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 4: Full Data Structure (saving to file)');
    console.log('='.repeat(80));
    const fullUrl = `${BASE_URL}/fixtures/${MATCH_ID}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue,league,season`;
    
    try {
      const response = await axios.get(fullUrl, { timeout: 15000 });
      
      if (response.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      } else {
        const match = response.data?.data;
        if (match) {
          const fs = require('fs');
          const filename = `match-${MATCH_ID}-full-data.json`;
          fs.writeFileSync(filename, JSON.stringify(match, null, 2));
          console.log(`\n✅ Full match data saved to: ${filename}`);
          console.log(`   File size: ${fs.statSync(filename).size} bytes`);
          console.log('\n=== SUMMARY ===');
          console.log('State ID:', match.state_id);
          console.log('Status:', match.status);
          console.log('Live:', match.live);
          console.log('Note:', match.note);
          console.log('Has Scoreboards:', !!match.scoreboards);
          console.log('Scoreboards Count:', match.scoreboards?.length || 0);
          console.log('Has League:', !!match.league);
          console.log('Has Season:', !!match.season);
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

examineFixturesEndpoint().catch(console.error);





