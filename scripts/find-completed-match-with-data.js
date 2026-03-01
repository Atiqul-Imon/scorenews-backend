/**
 * Find a completed match with actual result data from SportsMonk API
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!API_TOKEN) {
  console.error('❌ SPORTSMONKS_API_TOKEN not found');
  process.exit(1);
}

async function findCompletedMatch() {
  console.log('🔍 Finding Completed Match with Result Data\n');
  console.log(`Token: ${API_TOKEN.substring(0, 20)}...\n`);
  
  // Wait to avoid rate limiting
  console.log('⏳ Waiting 30 seconds for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    // Get fixtures and look for completed ones
    const fixturesUrl = `${BASE_URL}/fixtures?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue&per_page=50&sort=-starting_at`;
    
    const response = await axios.get(fixturesUrl, { timeout: 15000 });
    
    if (response.data?.status === 'error') {
      console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
      return;
    }
    
    const fixtures = response.data?.data || [];
    console.log(`✅ Retrieved ${fixtures.length} fixtures\n`);
    
    // Look for matches with result data
    const completedMatches = fixtures.filter(m => {
      // Check if match has result indicators
      const hasResult = m.note && (
        m.note.toLowerCase().includes('won by') ||
        m.note.toLowerCase().includes('tied') ||
        m.note.toLowerCase().includes('no result')
      );
      const hasScoreboards = m.scoreboards && Array.isArray(m.scoreboards) && m.scoreboards.length > 0;
      const statusComplete = m.status && (
        m.status.includes('Finished') ||
        m.status.includes('Completed') ||
        m.status.includes('Result')
      );
      
      return hasResult || hasScoreboards || statusComplete;
    });
    
    console.log(`Found ${completedMatches.length} matches with result indicators\n`);
    
    if (completedMatches.length > 0) {
      const match = completedMatches[0];
      console.log('='.repeat(80));
      console.log('COMPLETED MATCH FOUND');
      console.log('='.repeat(80));
      console.log('\nMatch ID:', match.id);
      console.log('Name:', match.name);
      console.log('State ID:', match.state_id);
      console.log('Status:', match.status);
      console.log('Live:', match.live);
      console.log('Note:', match.note);
      console.log('Result Info:', match.result_info);
      console.log('Starting At:', match.starting_at);
      
      if (match.localteam) {
        console.log('\nHome Team:', match.localteam.name, `(${match.localteam.code})`);
      }
      if (match.visitorteam) {
        console.log('Away Team:', match.visitorteam.name, `(${match.visitorteam.code})`);
      }
      
      if (match.scoreboards && Array.isArray(match.scoreboards)) {
        console.log(`\n=== SCOREBOARDS (${match.scoreboards.length} items) ===`);
        match.scoreboards.forEach((sb, idx) => {
          console.log(`\nScoreboard ${idx + 1}:`);
          console.log('  Keys:', Object.keys(sb).join(', '));
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
      }
      
      // Save full match data
      const fs = require('fs');
      const filename = `completed-match-${match.id}-full.json`;
      fs.writeFileSync(filename, JSON.stringify(match, null, 2));
      console.log(`\n✅ Full match data saved to: ${filename}`);
      
      // Now get detailed data for this match
      console.log('\n\n' + '='.repeat(80));
      console.log('GETTING DETAILED DATA FOR THIS MATCH');
      console.log('='.repeat(80));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const detailUrl = `${BASE_URL}/fixtures/${match.id}?api_token=${API_TOKEN}&include=localteam,visitorteam,scoreboards,venue,league,season`;
      const detailResponse = await axios.get(detailUrl, { timeout: 15000 });
      
      if (detailResponse.data?.status === 'error') {
        console.log('❌ API Error:', JSON.stringify(detailResponse.data.message, null, 2));
      } else {
        const detailedMatch = detailResponse.data?.data;
        if (detailedMatch) {
          const detailFilename = `completed-match-${match.id}-detailed.json`;
          fs.writeFileSync(detailFilename, JSON.stringify(detailedMatch, null, 2));
          console.log(`✅ Detailed match data saved to: ${detailFilename}`);
          
          console.log('\n=== DETAILED MATCH DATA ===');
          console.log('State ID:', detailedMatch.state_id);
          console.log('Status:', detailedMatch.status);
          console.log('Live:', detailedMatch.live);
          console.log('Note:', detailedMatch.note);
          console.log('Result Info:', detailedMatch.result_info);
          console.log('All Keys:', Object.keys(detailedMatch).join(', '));
        }
      }
    } else {
      console.log('❌ No completed matches found with result data');
      console.log('\nTrying to find any match with scoreboards...');
      
      const matchesWithScoreboards = fixtures.filter(m => 
        m.scoreboards && Array.isArray(m.scoreboards) && m.scoreboards.length > 0
      );
      
      if (matchesWithScoreboards.length > 0) {
        const match = matchesWithScoreboards[0];
        console.log(`\nFound match ${match.id} with scoreboards`);
        console.log('Status:', match.status);
        console.log('Note:', match.note);
        console.log('Scoreboards count:', match.scoreboards.length);
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

findCompletedMatch().catch(console.error);





