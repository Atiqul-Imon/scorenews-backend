const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkScotlandWestIndiesMatch() {
  try {
    console.log('🔍 Checking live matches for Scotland vs West Indies...\n');

    // Step 1: Get all live matches
    console.log('Step 1: Fetching live matches from /livescores endpoint...');
    const livescoresResponse = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
        _t: Date.now(),
      },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    const liveMatches = livescoresResponse.data?.data || [];
    console.log(`Found ${liveMatches.length} live matches\n`);

    // Step 2: Find Scotland vs West Indies match
    let scotlandMatch = null;
    for (const match of liveMatches) {
      const localTeam = match.localteam?.name || '';
      const visitorTeam = match.visitorteam?.name || '';
      const matchName = match.name || '';

      if (
        (localTeam.toLowerCase().includes('scotland') && visitorTeam.toLowerCase().includes('west indies')) ||
        (localTeam.toLowerCase().includes('west indies') && visitorTeam.toLowerCase().includes('scotland')) ||
        matchName.toLowerCase().includes('scotland') && matchName.toLowerCase().includes('west indies')
      ) {
        scotlandMatch = match;
        break;
      }
    }

    if (!scotlandMatch) {
      console.log('❌ Scotland vs West Indies match not found in live matches');
      console.log('\nAvailable matches:');
      liveMatches.forEach((m, i) => {
        console.log(`${i + 1}. ${m.localteam?.name || 'Team1'} vs ${m.visitorteam?.name || 'Team2'} (ID: ${m.id}, State: ${m.state_id})`);
      });
      return;
    }

    console.log('✅ Found Scotland vs West Indies match!');
    console.log(`Match ID: ${scotlandMatch.id}`);
    console.log(`State ID: ${scotlandMatch.state_id}`);
    console.log(`Status: ${scotlandMatch.status || 'N/A'}`);
    console.log(`Live: ${scotlandMatch.live || false}\n`);

    // Step 3: Get full match details
    console.log('Step 2: Fetching full match details...');
    const matchDetailsResponse = await axios.get(`${BASE_URL}/fixtures/${scotlandMatch.id}`, {
      params: {
        api_token: API_TOKEN,
        include: 'localteam,visitorteam,scoreboards,batting.batsman,bowling.bowler,venue,league,season',
        _t: Date.now(),
      },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    const matchDetails = matchDetailsResponse.data?.data;
    if (!matchDetails) {
      console.log('❌ Failed to get match details');
      return;
    }

    console.log('\n📊 MATCH DETAILS:');
    console.log('='.repeat(80));
    console.log(`Match ID: ${matchDetails.id}`);
    console.log(`Name: ${matchDetails.name || 'N/A'}`);
    console.log(`State ID: ${matchDetails.state_id}`);
    console.log(`Status: ${matchDetails.status || 'N/A'}`);
    console.log(`Live: ${matchDetails.live || false}`);
    console.log(`Starting At: ${matchDetails.starting_at || 'N/A'}`);

    // Scoreboards - Detailed analysis
    if (matchDetails.scoreboards && Array.isArray(matchDetails.scoreboards)) {
      console.log('\n📈 SCOREBOARDS (Detailed):');
      matchDetails.scoreboards.forEach((scoreboard, idx) => {
        console.log(`\nScoreboard ${idx + 1}:`);
        console.log(`  All keys: ${Object.keys(scoreboard).join(', ')}`);
        console.log(`  Type: ${scoreboard.type || 'N/A'}`);
        console.log(`  Scoreboard ID: ${scoreboard.scoreboard || 'N/A'}`);
        console.log(`  Team ID: ${scoreboard.team_id || 'N/A'}`);
        console.log(`  Score: ${scoreboard.score || scoreboard.total || 0}/${scoreboard.wickets || 0}`);
        console.log(`  Total: ${scoreboard.total || 'N/A'}`);
        console.log(`  Overs: ${scoreboard.overs || 0}`);
        console.log(`  Balls: ${scoreboard.balls || 'N/A'}`);
        console.log(`  Run Rate: ${scoreboard.run_rate || 'N/A'}`);
        console.log(`  Full data: ${JSON.stringify(scoreboard, null, 2)}`);
      });
    } else {
      console.log('\n⚠️  No scoreboards found');
    }

    // Batting
    if (matchDetails.batting && Array.isArray(matchDetails.batting)) {
      console.log('\n🏏 BATTING:');
      matchDetails.batting.forEach((bat, idx) => {
        console.log(`\nBatsman ${idx + 1}:`);
        console.log(`  Player: ${bat.batsman?.fullname || bat.batsman?.name || 'N/A'}`);
        console.log(`  Runs: ${bat.runs || 0}`);
        console.log(`  Balls: ${bat.balls || 0}`);
        console.log(`  Fours: ${bat.fours || 0}`);
        console.log(`  Sixes: ${bat.sixes || 0}`);
        console.log(`  Strike Rate: ${bat.strike_rate || 'N/A'}`);
        console.log(`  Is Out: ${bat.out || false}`);
        console.log(`  Team ID: ${bat.team_id || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  No batting data found');
    }

    // Bowling
    if (matchDetails.bowling && Array.isArray(matchDetails.bowling)) {
      console.log('\n🎳 BOWLING:');
      matchDetails.bowling.forEach((bowl, idx) => {
        console.log(`\nBowler ${idx + 1}:`);
        console.log(`  Player: ${bowl.bowler?.fullname || bowl.bowler?.name || 'N/A'}`);
        console.log(`  Overs: ${bowl.overs || 0}`);
        console.log(`  Maidens: ${bowl.maidens || 0}`);
        console.log(`  Runs: ${bowl.runs || 0}`);
        console.log(`  Wickets: ${bowl.wickets || 0}`);
        console.log(`  Economy: ${bowl.economy || 'N/A'}`);
        console.log(`  Team ID: ${bowl.team_id || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  No bowling data found');
    }

    // Teams
    console.log('\n👥 TEAMS:');
    console.log(`Local Team: ${matchDetails.localteam?.name || 'N/A'} (ID: ${matchDetails.localteam?.id || 'N/A'})`);
    console.log(`Visitor Team: ${matchDetails.visitorteam?.name || 'N/A'} (ID: ${matchDetails.visitorteam?.id || 'N/A'})`);

    // Raw data summary
    console.log('\n📋 RAW DATA SUMMARY:');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      id: matchDetails.id,
      name: matchDetails.name,
      state_id: matchDetails.state_id,
      status: matchDetails.status,
      live: matchDetails.live,
      starting_at: matchDetails.starting_at,
      scoreboards_count: matchDetails.scoreboards?.length || 0,
      batting_count: matchDetails.batting?.length || 0,
      bowling_count: matchDetails.bowling?.length || 0,
      localteam: matchDetails.localteam?.name,
      visitorteam: matchDetails.visitorteam?.name,
    }, null, 2));

    // Step 4: Check what our backend endpoint returns
    console.log('\n\n🔍 Checking backend endpoint response...');
    const backendUrl = process.env.API_URL || 'http://localhost:5000';
    try {
      const backendResponse = await axios.get(`${backendUrl}/api/v1/cricket/matches/${scotlandMatch.id}`, {
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      const backendMatch = backendResponse.data?.data;
      if (backendMatch) {
        console.log('\n📊 BACKEND RESPONSE:');
        console.log('='.repeat(80));
        console.log(`Match ID: ${backendMatch.matchId || backendMatch._id || backendMatch.id}`);
        console.log(`Status: ${backendMatch.status || 'N/A'}`);
        if (backendMatch.currentScore) {
          console.log('\nCurrent Score:');
          if (backendMatch.currentScore.home) {
            console.log(`  Home: ${backendMatch.currentScore.home.runs || 0}/${backendMatch.currentScore.home.wickets || 0} (${backendMatch.currentScore.home.overs || 0}.${backendMatch.currentScore.home.balls || 0})`);
          }
          if (backendMatch.currentScore.away) {
            console.log(`  Away: ${backendMatch.currentScore.away.runs || 0}/${backendMatch.currentScore.away.wickets || 0} (${backendMatch.currentScore.away.overs || 0}.${backendMatch.currentScore.away.balls || 0})`);
          }
        }
        console.log('\nFull Backend Response:');
        console.log(JSON.stringify(backendMatch, null, 2));
      } else {
        console.log('❌ Backend returned no match data');
        console.log('Response:', JSON.stringify(backendResponse.data, null, 2));
      }
    } catch (backendError) {
      console.log('❌ Error calling backend endpoint:', backendError.message);
      if (backendError.response) {
        console.log('Status:', backendError.response.status);
        console.log('Response:', JSON.stringify(backendError.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkScotlandWestIndiesMatch();

