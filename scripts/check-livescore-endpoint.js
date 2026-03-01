const axios = require('axios');
require('dotenv').config();

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkLivescoreEndpoint() {
  try {
    console.log('=== Testing Livescore Endpoint ===');
    console.log(`Token: ${API_TOKEN ? API_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`URL: ${BASE_URL}/livescores`);
    console.log('');

    const startTime = Date.now();
    const response = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });
    const endTime = Date.now();

    console.log(`✅ Response received in ${endTime - startTime}ms`);
    console.log(`Status: ${response.status}`);
    console.log('');

    // Check response structure
    const data = response.data;
    console.log('=== Response Structure ===');
    console.log(`Top-level keys: ${Object.keys(data).join(', ')}`);
    console.log('');

    // Check for error
    if (data.status === 'error') {
      console.log('❌ API Error:');
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Get matches
    const matches = data.data || [];
    console.log(`=== Matches Found: ${matches.length} ===`);
    console.log('');

    if (matches.length > 0) {
      // Show first match structure
      const firstMatch = matches[0];
      console.log('=== First Match Structure ===');
      console.log(`ID: ${firstMatch.id}`);
      console.log(`Name: ${firstMatch.name || 'N/A'}`);
      console.log(`State ID: ${firstMatch.state_id}`);
      console.log(`Status: ${firstMatch.status}`);
      console.log(`Live: ${firstMatch.live}`);
      console.log(`Starting At: ${firstMatch.starting_at}`);
      console.log('');

      // Check what data is included
      console.log('=== Included Data ===');
      console.log(`Has localteam: ${!!firstMatch.localteam}`);
      console.log(`Has visitorteam: ${!!firstMatch.visitorteam}`);
      console.log(`Has venue: ${!!firstMatch.venue}`);
      console.log(`Has scoreboards: ${!!firstMatch.scoreboards}`);
      console.log(`Scoreboards count: ${firstMatch.scoreboards?.length || 0}`);
      console.log('');

      // Check scoreboards structure
      if (firstMatch.scoreboards && firstMatch.scoreboards.length > 0) {
        console.log('=== Scoreboard Structure ===');
        const sb = firstMatch.scoreboards[0];
        console.log(`Scoreboard keys: ${Object.keys(sb).join(', ')}`);
        console.log(`Has batting: ${!!sb.batting}`);
        console.log(`Has bowling: ${!!sb.bowling}`);
        console.log(`Batting count: ${sb.batting?.length || 0}`);
        console.log(`Bowling count: ${sb.bowling?.length || 0}`);
        console.log('');

        // Check if batting/bowling have player names
        if (sb.batting && sb.batting.length > 0) {
          const firstBatting = sb.batting[0];
          console.log('=== First Batting Record ===');
          console.log(`Keys: ${Object.keys(firstBatting).join(', ')}`);
          console.log(`Has playerId: ${!!firstBatting.player_id}`);
          console.log(`Has playerName: ${!!firstBatting.player_name || !!firstBatting.name}`);
          console.log(`Has batsman: ${!!firstBatting.batsman}`);
          if (firstBatting.batsman) {
            console.log(`Batsman keys: ${Object.keys(firstBatting.batsman).join(', ')}`);
            console.log(`Batsman name: ${firstBatting.batsman.name || firstBatting.batsman.fullname || 'N/A'}`);
          }
          console.log('');
        }

        if (sb.bowling && sb.bowling.length > 0) {
          const firstBowling = sb.bowling[0];
          console.log('=== First Bowling Record ===');
          console.log(`Keys: ${Object.keys(firstBowling).join(', ')}`);
          console.log(`Has playerId: ${!!firstBowling.player_id}`);
          console.log(`Has playerName: ${!!firstBowling.player_name || !!firstBowling.name}`);
          console.log(`Has bowler: ${!!firstBowling.bowler}`);
          if (firstBowling.bowler) {
            console.log(`Bowler keys: ${Object.keys(firstBowling.bowler).join(', ')}`);
            console.log(`Bowler name: ${firstBowling.bowler.name || firstBowling.bowler.fullname || 'N/A'}`);
          }
          console.log('');
        }
      }

      // Show all matches summary
      console.log('=== All Matches Summary ===');
      matches.forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}, Name: ${match.name || 'N/A'}, State: ${match.state_id}, Live: ${match.live}`);
      });
    } else {
      console.log('⚠️  No live matches found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkLivescoreEndpoint();



