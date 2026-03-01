const axios = require('axios');
require('dotenv').config();

const CRICKET_API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || 
                          process.env.SPORTMONKS_API_TOKEN || 
                          process.env.SPORTSMONK_API_TOKEN ||
                          '';
const FOOTBALL_API_TOKEN = process.env.SPORTSMONK_FOOTBALL_API_TOKEN || 
                          process.env.SPORTMONK_FOOTBALL_API_TOKEN || 
                          CRICKET_API_TOKEN;

const CRICKET_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const FOOTBALL_BASE_URL = 'https://api.sportmonks.com/v3/football';

async function checkCricketLivescores() {
  try {
    console.log('\n=== CHECKING CRICKET /livescores ENDPOINT ===');
    
    const response = await axios.get(`${CRICKET_BASE_URL}/livescores`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });

    const matches = response.data?.data || [];
    console.log(`✅ Response Status: ${response.status}`);
    console.log(`📊 Matches found: ${matches.length}`);
    console.log('');

    if (matches.length > 0) {
      console.log('=== LIVE CRICKET MATCHES ===');
      matches.forEach((match, idx) => {
        console.log(`\n${idx + 1}. Match ID: ${match.id}`);
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
          match.scoreboards.forEach((sb, sbIdx) => {
            console.log(`     Innings ${sbIdx + 1}: ${sb.type || 'N/A'}, Runs: ${sb.runs || 0}, Wickets: ${sb.wickets || 0}`);
          });
        }
        
        // Check if match has score data
        if (match.scoreboards && match.scoreboards.length > 0) {
          const currentInnings = match.scoreboards.find(sb => sb.type === 'total') || match.scoreboards[0];
          if (currentInnings) {
            console.log(`   Current Score: ${currentInnings.runs || 0}/${currentInnings.wickets || 0} (${currentInnings.overs || 0} overs)`);
          }
        }
      });
    } else {
      console.log('⚠️  No live cricket matches in /livescores endpoint');
      console.log('   This means there are currently no matches in progress');
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

async function checkFootballLivescores() {
  try {
    console.log('\n=== CHECKING FOOTBALL /livescores/inplay ENDPOINT ===');
    
    const response = await axios.get(`${FOOTBALL_BASE_URL}/livescores/inplay`, {
      params: {
        api_token: FOOTBALL_API_TOKEN,
        include: 'participants;state;league;scores',
      },
    });

    let matches = [];
    if (Array.isArray(response.data?.data)) {
      matches = response.data.data;
    } else if (response.data?.data?.data && Array.isArray(response.data.data.data)) {
      matches = response.data.data.data;
    } else if (response.data?.data && typeof response.data.data === 'object') {
      matches = Object.values(response.data.data);
    }

    console.log(`✅ Response Status: ${response.status}`);
    console.log(`📊 Matches found: ${matches.length}`);
    console.log('');

    if (matches.length > 0) {
      console.log('=== LIVE FOOTBALL MATCHES ===');
      matches.forEach((match, idx) => {
        console.log(`\n${idx + 1}. Match ID: ${match.id}`);
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
          if (score.minute) {
            console.log(`   Minute: ${score.minute}`);
          }
        }
        console.log(`   Starting At: ${match.starting_at || 'N/A'}`);
      });
    } else {
      console.log('⚠️  No live football matches in /livescores/inplay endpoint');
      console.log('   This means there are currently no matches in progress');
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
  console.log('  CHECKING LIVE MATCHES (LIVESCORES)');
  console.log('========================================');
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log('');
  
  const cricketMatches = await checkCricketLivescores();
  const footballMatches = await checkFootballLivescores();
  
  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Cricket live matches: ${cricketMatches.length}`);
  console.log(`Football live matches: ${footballMatches.length}`);
  console.log(`Total live matches: ${cricketMatches.length + footballMatches.length}`);
  console.log('');
  
  if (cricketMatches.length === 0 && footballMatches.length === 0) {
    console.log('⚠️  No live matches found in /livescores endpoints');
    console.log('   This is normal if there are no matches currently in progress');
    console.log('   The /livescores endpoint only returns matches that are actively live');
  } else {
    console.log('✅ Live matches detected!');
  }
}

main().catch(console.error);



