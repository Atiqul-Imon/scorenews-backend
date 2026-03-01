const axios = require('axios');
require('dotenv').config();

// Try multiple possible env variable names
const CRICKET_API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || 
                          process.env.SPORTMONKS_API_TOKEN || 
                          process.env.SPORTSMONK_API_TOKEN ||
                          '';
const FOOTBALL_API_TOKEN = process.env.SPORTSMONK_FOOTBALL_API_TOKEN || 
                          process.env.SPORTMONK_FOOTBALL_API_TOKEN || 
                          CRICKET_API_TOKEN;

const CRICKET_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const FOOTBALL_BASE_URL = 'https://api.sportmonks.com/v3/football';

async function checkCricketLiveMatches() {
  try {
    console.log('\n=== CHECKING CRICKET LIVE MATCHES ===');
    console.log(`Token: ${CRICKET_API_TOKEN ? CRICKET_API_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`URL: ${CRICKET_BASE_URL}/livescores`);
    console.log('');

    const startTime = Date.now();
    const response = await axios.get(`${CRICKET_BASE_URL}/livescores`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });
    const endTime = Date.now();

    console.log(`✅ Response received in ${endTime - startTime}ms`);
    console.log(`Status: ${response.status}`);
    console.log('');

    const data = response.data;
    
    // Check for error
    if (data.status === 'error') {
      console.log('❌ API Error:');
      console.log(JSON.stringify(data, null, 2));
      return [];
    }

    // Get matches
    const matches = data.data || [];
    console.log(`=== Cricket Matches Found: ${matches.length} ===`);
    console.log('');

    if (matches.length > 0) {
      matches.forEach((match, idx) => {
        console.log(`${idx + 1}. Match ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State ID: ${match.state_id}`);
        console.log(`   Status: ${match.status}`);
        console.log(`   Live: ${match.live}`);
        console.log(`   Starting At: ${match.starting_at || 'N/A'}`);
        if (match.localteam && match.visitorteam) {
          console.log(`   Teams: ${match.localteam.name || 'T1'} vs ${match.visitorteam.name || 'T2'}`);
        }
        if (match.scoreboards && match.scoreboards.length > 0) {
          console.log(`   Scoreboards: ${match.scoreboards.length} innings`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No live cricket matches found');
    }

    return matches;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

async function checkFootballLiveMatches() {
  try {
    console.log('\n=== CHECKING FOOTBALL LIVE MATCHES ===');
    console.log(`Token: ${FOOTBALL_API_TOKEN ? FOOTBALL_API_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`URL: ${FOOTBALL_BASE_URL}/livescores/inplay`);
    console.log('');

    const startTime = Date.now();
    const response = await axios.get(`${FOOTBALL_BASE_URL}/livescores/inplay`, {
      params: {
        api_token: FOOTBALL_API_TOKEN,
        include: 'participants;state;league',
      },
    });
    const endTime = Date.now();

    console.log(`✅ Response received in ${endTime - startTime}ms`);
    console.log(`Status: ${response.status}`);
    console.log('');

    const data = response.data;
    
    // Check for error
    if (data.status === 'error') {
      console.log('❌ API Error:');
      console.log(JSON.stringify(data, null, 2));
      return [];
    }

    // Get matches - v3 API structure might be different
    let matches = [];
    if (Array.isArray(data.data)) {
      matches = data.data;
    } else if (data.data && Array.isArray(data.data.data)) {
      matches = data.data.data;
    } else if (data.data && typeof data.data === 'object') {
      matches = Object.values(data.data);
    }

    console.log(`=== Football Matches Found: ${matches.length} ===`);
    console.log('');

    if (matches.length > 0) {
      matches.forEach((match, idx) => {
        console.log(`${idx + 1}. Match ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        if (match.state) {
          console.log(`   State: ${match.state.name || match.state_id}`);
        }
        if (match.participants && match.participants.length >= 2) {
          console.log(`   Teams: ${match.participants[0].name || 'T1'} vs ${match.participants[1].name || 'T2'}`);
        }
        if (match.scores && match.scores.length > 0) {
          const score = match.scores[0];
          console.log(`   Score: ${score.score || '0-0'}`);
        }
        console.log(`   Starting At: ${match.starting_at || match.starting_at || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No live football matches found');
    }

    return matches;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

async function main() {
  console.log('========================================');
  console.log('  CHECKING LIVE MATCHES FROM API');
  console.log('========================================');
  
  const cricketMatches = await checkCricketLiveMatches();
  const footballMatches = await checkFootballLiveMatches();
  
  console.log('\n=== SUMMARY ===');
  console.log(`Cricket live matches: ${cricketMatches.length}`);
  console.log(`Football live matches: ${footballMatches.length}`);
  console.log(`Total live matches: ${cricketMatches.length + footballMatches.length}`);
  console.log('');
  
  if (cricketMatches.length === 0 && footballMatches.length === 0) {
    console.log('⚠️  No live matches found in either sport');
  } else {
    console.log('✅ Live matches detected!');
  }
}

main().catch(console.error);

