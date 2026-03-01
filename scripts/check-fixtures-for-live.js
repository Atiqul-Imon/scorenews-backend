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

async function checkCricketFixtures() {
  try {
    console.log('\n=== CHECKING CRICKET FIXTURES ===');
    
    const response = await axios.get(`${CRICKET_BASE_URL}/fixtures`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'localteam,visitorteam,venue',
        per_page: 50,
      },
    });

    const matches = response.data?.data || [];
    console.log(`Total fixtures returned: ${matches.length}`);
    console.log('');

    // Filter for matches that might be live or starting soon
    const now = new Date();
    const matchesByStatus = {
      live: [],
      upcoming: [],
      completed: [],
      other: [],
    };

    matches.forEach((match) => {
      const startTime = match.starting_at ? new Date(match.starting_at) : null;
      const stateId = match.state_id;
      
      // State IDs: 1=Not Started, 2=In Progress, 3=Finished, 4=Cancelled, 5=Abandoned, 6=Postponed
      if (stateId === 2 || match.live === true) {
        matchesByStatus.live.push(match);
      } else if (stateId === 1 && startTime && startTime <= now) {
        // Not started but time has passed - might be starting
        matchesByStatus.upcoming.push(match);
      } else if (stateId === 3 || stateId === 5) {
        matchesByStatus.completed.push(match);
      } else {
        matchesByStatus.other.push(match);
      }
    });

    console.log('=== Matches by Status ===');
    console.log(`Live/In Progress: ${matchesByStatus.live.length}`);
    console.log(`Upcoming (time passed): ${matchesByStatus.upcoming.length}`);
    console.log(`Completed: ${matchesByStatus.completed.length}`);
    console.log(`Other: ${matchesByStatus.other.length}`);
    console.log('');

    if (matchesByStatus.live.length > 0) {
      console.log('=== LIVE/IN PROGRESS MATCHES ===');
      matchesByStatus.live.forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State ID: ${match.state_id}`);
        console.log(`   Status: ${match.status}`);
        console.log(`   Live: ${match.live}`);
        console.log(`   Starting At: ${match.starting_at}`);
        if (match.localteam && match.visitorteam) {
          console.log(`   Teams: ${match.localteam.name} vs ${match.visitorteam.name}`);
        }
        console.log('');
      });
    }

    if (matchesByStatus.upcoming.length > 0) {
      console.log('=== UPCOMING MATCHES (Time Passed) ===');
      matchesByStatus.upcoming.slice(0, 5).forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State ID: ${match.state_id}`);
        console.log(`   Starting At: ${match.starting_at}`);
        if (match.localteam && match.visitorteam) {
          console.log(`   Teams: ${match.localteam.name} vs ${match.visitorteam.name}`);
        }
        console.log('');
      });
    }

    // Show sample of all matches
    if (matches.length > 0) {
      console.log('=== SAMPLE OF ALL FIXTURES (First 10) ===');
      matches.slice(0, 10).forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}, State: ${match.state_id}, Status: ${match.status}, Live: ${match.live}, Start: ${match.starting_at}`);
      });
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

async function checkFootballFixtures() {
  try {
    console.log('\n=== CHECKING FOOTBALL FIXTURES ===');
    
    const response = await axios.get(`${FOOTBALL_BASE_URL}/fixtures`, {
      params: {
        api_token: FOOTBALL_API_TOKEN,
        include: 'participants;state;league',
        per_page: 50,
      },
    });

    let matches = [];
    if (Array.isArray(response.data?.data)) {
      matches = response.data.data;
    } else if (response.data?.data?.data && Array.isArray(response.data.data.data)) {
      matches = response.data.data.data;
    }

    console.log(`Total fixtures returned: ${matches.length}`);
    console.log('');

    // Filter by state
    const matchesByState = {};
    matches.forEach((match) => {
      const stateName = match.state?.name || 'Unknown';
      if (!matchesByState[stateName]) {
        matchesByState[stateName] = [];
      }
      matchesByState[stateName].push(match);
    });

    console.log('=== Matches by State ===');
    Object.keys(matchesByState).forEach(state => {
      console.log(`${state}: ${matchesByState[state].length}`);
    });
    console.log('');

    // Show live/in-play matches
    const liveMatches = matches.filter(m => 
      m.state?.name?.toLowerCase().includes('live') || 
      m.state?.name?.toLowerCase().includes('in play') ||
      m.state_id === 2
    );

    if (liveMatches.length > 0) {
      console.log('=== LIVE/IN PLAY MATCHES ===');
      liveMatches.forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State: ${match.state?.name || match.state_id}`);
        if (match.participants && match.participants.length >= 2) {
          console.log(`   Teams: ${match.participants[0].name} vs ${match.participants[1].name}`);
        }
        console.log(`   Starting At: ${match.starting_at || 'N/A'}`);
        console.log('');
      });
    }

    // Show sample
    if (matches.length > 0) {
      console.log('=== SAMPLE OF ALL FIXTURES (First 10) ===');
      matches.slice(0, 10).forEach((match, idx) => {
        console.log(`${idx + 1}. ID: ${match.id}, State: ${match.state?.name || match.state_id}, Start: ${match.starting_at}`);
      });
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
  console.log('  CHECKING FIXTURES FOR LIVE MATCHES');
  console.log('========================================');
  
  const cricketMatches = await checkCricketFixtures();
  const footballMatches = await checkFootballFixtures();
  
  console.log('\n=== SUMMARY ===');
  console.log(`Cricket fixtures checked: ${cricketMatches.length}`);
  console.log(`Football fixtures checked: ${footballMatches.length}`);
}

main().catch(console.error);



