/**
 * Simple script to check API response structure
 * Tests with minimal includes to see what data is actually returned
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!API_TOKEN) {
  console.error('❌ SPORTSMONKS_API_TOKEN not found');
  process.exit(1);
}

async function testSimple() {
  console.log('🔍 Testing SportsMonks API Response Structure\n');
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  // Wait to avoid rate limiting
  console.log('⏳ Waiting 15 seconds for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Test 1: Get live matches (minimal includes)
  try {
    console.log('Test 1: Fetching live matches with scoreboards...\n');
    const liveUrl = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`;
    const liveResponse = await axios.get(liveUrl, { timeout: 10000 });
    
    if (liveResponse.data?.status === 'error') {
      console.log('❌ Error:', JSON.stringify(liveResponse.data.message, null, 2));
    } else {
      const matches = liveResponse.data?.data || [];
      console.log(`✅ Found ${matches.length} live matches\n`);
      
      if (matches.length > 0) {
        const match = matches[0];
        console.log(`Using match ID: ${match.id} (${match.name || 'Unknown'})\n`);
        
        // Test 2: Get match details with scoreboards only
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('\nTest 2: Fetching match details with scoreboards only...\n');
        const detailUrl = `${BASE_URL}/fixtures/${match.id}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue`;
        const detailResponse = await axios.get(detailUrl, { timeout: 10000 });
        
        if (detailResponse.data?.status === 'error') {
          console.log('❌ Error:', JSON.stringify(detailResponse.data.message, null, 2));
        } else {
          const matchData = detailResponse.data?.data;
          console.log('✅ Match details fetched successfully\n');
          
          console.log('Top-level keys:', Object.keys(matchData).join(', '));
          
          // Check scoreboards
          if (matchData.scoreboards && Array.isArray(matchData.scoreboards)) {
            console.log(`\n✅ Scoreboards: ${matchData.scoreboards.length} items`);
            matchData.scoreboards.forEach((sb, idx) => {
              console.log(`\n  Scoreboard ${idx + 1}:`);
              console.log('  Keys:', Object.keys(sb).join(', '));
              console.log('  Type:', sb.type);
              console.log('  Overs:', sb.overs);
              console.log('  Total:', sb.total);
              console.log('  Wickets:', sb.wickets);
              
              if (sb.batting) {
                console.log(`  ✅ Has batting: ${Array.isArray(sb.batting) ? sb.batting.length + ' items' : typeof sb.batting}`);
                if (Array.isArray(sb.batting) && sb.batting.length > 0) {
                  const sample = sb.batting[0];
                  console.log('  Sample batting keys:', Object.keys(sample).join(', '));
                  if (sample.batsman) {
                    console.log('  ✅ Has batsman:', typeof sample.batsman);
                    if (typeof sample.batsman === 'object' && sample.batsman !== null) {
                      console.log('  Batsman keys:', Object.keys(sample.batsman).join(', '));
                      console.log('  Batsman name:', sample.batsman.fullname || sample.batsman.name || 'N/A');
                    }
                  }
                }
              } else {
                console.log('  ❌ No batting in scoreboard');
              }
              
              if (sb.bowling) {
                console.log(`  ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : typeof sb.bowling}`);
                if (Array.isArray(sb.bowling) && sb.bowling.length > 0) {
                  const sample = sb.bowling[0];
                  console.log('  Sample bowling keys:', Object.keys(sample).join(', '));
                  if (sample.bowler) {
                    console.log('  ✅ Has bowler:', typeof sample.bowler);
                    if (typeof sample.bowler === 'object' && sample.bowler !== null) {
                      console.log('  Bowler keys:', Object.keys(sample.bowler).join(', '));
                      console.log('  Bowler name:', sample.bowler.fullname || sample.bowler.name || 'N/A');
                    }
                  }
                }
              } else {
                console.log('  ❌ No bowling in scoreboard');
              }
            });
          } else {
            console.log('\n❌ No scoreboards or not an array');
          }
          
          // Check root level batting/bowling
          if (matchData.batting) {
            console.log(`\n✅ Root level batting: ${Array.isArray(matchData.batting) ? matchData.batting.length + ' items' : typeof matchData.batting}`);
          } else {
            console.log('\n❌ No root level batting');
          }
          
          if (matchData.bowling) {
            console.log(`✅ Root level bowling: ${Array.isArray(matchData.bowling) ? matchData.bowling.length + ' items' : typeof matchData.bowling}`);
          } else {
            console.log('❌ No root level bowling');
          }
          
          // Check for balls (commentary)
          if (matchData.balls) {
            console.log(`\n✅ Balls (commentary): ${Array.isArray(matchData.balls) ? matchData.balls.length + ' items' : typeof matchData.balls}`);
          } else {
            console.log('\n❌ No balls (commentary)');
          }
        }
      } else {
        console.log('⚠️ No live matches found. Testing with a completed match...\n');
        
        // Try to get a recent completed match
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Test 3: Fetching recent fixtures...\n');
        const fixturesUrl = `${BASE_URL}/fixtures?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue&per_page=5`;
        const fixturesResponse = await axios.get(fixturesUrl, { timeout: 10000 });
        
        if (fixturesResponse.data?.status === 'error') {
          console.log('❌ Error:', JSON.stringify(fixturesResponse.data.message, null, 2));
        } else {
          const fixtures = fixturesResponse.data?.data || [];
          console.log(`✅ Found ${fixtures.length} fixtures\n`);
          
          if (fixtures.length > 0) {
            const testMatch = fixtures[0];
            console.log(`Using fixture ID: ${testMatch.id} (${testMatch.name || 'Unknown'})\n`);
            console.log('State ID:', testMatch.state_id);
            console.log('Status:', testMatch.status);
            
            // Check if it has scoreboards
            if (testMatch.scoreboards && Array.isArray(testMatch.scoreboards)) {
              console.log(`\n✅ Scoreboards: ${testMatch.scoreboards.length} items`);
              testMatch.scoreboards.forEach((sb, idx) => {
                console.log(`\n  Scoreboard ${idx + 1}:`);
                console.log('  Keys:', Object.keys(sb).join(', '));
                if (sb.batting) console.log(`  ✅ Has batting: ${Array.isArray(sb.batting) ? sb.batting.length + ' items' : 'not array'}`);
                if (sb.bowling) console.log(`  ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : 'not array'}`);
              });
            }
          }
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
}

testSimple().catch(console.error);

