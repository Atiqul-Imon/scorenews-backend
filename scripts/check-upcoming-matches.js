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

async function checkUpcomingCricketMatches() {
  try {
    console.log('\n=== CHECKING UPCOMING CRICKET MATCHES ===');
    
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const response = await axios.get(`${CRICKET_BASE_URL}/fixtures`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'localteam,visitorteam,venue',
        per_page: 100,
      },
    });

    const allMatches = response.data?.data || [];
    
    // Filter for matches starting today or in next 24 hours
    const upcomingMatches = allMatches.filter(match => {
      if (!match.starting_at) return false;
      const startTime = new Date(match.starting_at);
      const timeDiff = startTime.getTime() - now.getTime();
      // Matches starting in next 24 hours or started in last 2 hours
      return timeDiff > -2 * 60 * 60 * 1000 && timeDiff < 24 * 60 * 60 * 1000;
    }).sort((a, b) => {
      const timeA = new Date(a.starting_at).getTime();
      const timeB = new Date(b.starting_at).getTime();
      return timeA - timeB;
    });

    console.log(`Total fixtures: ${allMatches.length}`);
    console.log(`Upcoming/Recent matches (next 24h or last 2h): ${upcomingMatches.length}`);
    console.log('');

    if (upcomingMatches.length > 0) {
      console.log('=== UPCOMING/RECENT CRICKET MATCHES ===');
      upcomingMatches.slice(0, 20).forEach((match, idx) => {
        const startTime = new Date(match.starting_at);
        const timeDiff = startTime.getTime() - now.getTime();
        const hoursFromNow = (timeDiff / (1000 * 60 * 60)).toFixed(1);
        
        console.log(`\n${idx + 1}. Match ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        console.log(`   State ID: ${match.state_id}`);
        console.log(`   Status: ${match.status}`);
        console.log(`   Live: ${match.live}`);
        console.log(`   Starting At: ${match.starting_at}`);
        console.log(`   Time from now: ${hoursFromNow > 0 ? `+${hoursFromNow}h` : `${hoursFromNow}h`}`);
        
        if (match.localteam && match.visitorteam) {
          console.log(`   Teams: ${match.localteam.name} vs ${match.visitorteam.name}`);
        }
      });
    } else {
      console.log('⚠️  No upcoming matches in next 24 hours');
    }

    return upcomingMatches;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

async function checkUpcomingFootballMatches() {
  try {
    console.log('\n=== CHECKING UPCOMING FOOTBALL MATCHES ===');
    
    const now = new Date();
    
    const response = await axios.get(`${FOOTBALL_BASE_URL}/fixtures`, {
      params: {
        api_token: FOOTBALL_API_TOKEN,
        include: 'participants;state;league',
        per_page: 100,
      },
    });

    let allMatches = [];
    if (Array.isArray(response.data?.data)) {
      allMatches = response.data.data;
    } else if (response.data?.data?.data && Array.isArray(response.data.data.data)) {
      allMatches = response.data.data.data;
    }

    // Filter for matches starting today or in next 24 hours
    const upcomingMatches = allMatches.filter(match => {
      if (!match.starting_at) return false;
      const startTime = new Date(match.starting_at);
      const timeDiff = startTime.getTime() - now.getTime();
      // Matches starting in next 24 hours or started in last 2 hours
      return timeDiff > -2 * 60 * 60 * 1000 && timeDiff < 24 * 60 * 60 * 1000;
    }).sort((a, b) => {
      const timeA = new Date(a.starting_at).getTime();
      const timeB = new Date(b.starting_at).getTime();
      return timeA - timeB;
    });

    console.log(`Total fixtures: ${allMatches.length}`);
    console.log(`Upcoming/Recent matches (next 24h or last 2h): ${upcomingMatches.length}`);
    console.log('');

    if (upcomingMatches.length > 0) {
      console.log('=== UPCOMING/RECENT FOOTBALL MATCHES ===');
      upcomingMatches.slice(0, 20).forEach((match, idx) => {
        const startTime = new Date(match.starting_at);
        const timeDiff = startTime.getTime() - now.getTime();
        const hoursFromNow = (timeDiff / (1000 * 60 * 60)).toFixed(1);
        
        console.log(`\n${idx + 1}. Match ID: ${match.id}`);
        console.log(`   Name: ${match.name || 'N/A'}`);
        if (match.state) {
          console.log(`   State: ${match.state.name || match.state_id}`);
        }
        console.log(`   Starting At: ${match.starting_at}`);
        console.log(`   Time from now: ${hoursFromNow > 0 ? `+${hoursFromNow}h` : `${hoursFromNow}h`}`);
        
        if (match.participants && match.participants.length >= 2) {
          console.log(`   Teams: ${match.participants[0].name} vs ${match.participants[1].name}`);
        }
      });
    } else {
      console.log('⚠️  No upcoming matches in next 24 hours');
    }

    return upcomingMatches;
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
  console.log('  CHECKING UPCOMING/RECENT MATCHES');
  console.log('========================================');
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log('');
  
  const cricketMatches = await checkUpcomingCricketMatches();
  const footballMatches = await checkUpcomingFootballMatches();
  
  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Cricket upcoming/recent: ${cricketMatches.length}`);
  console.log(`Football upcoming/recent: ${footballMatches.length}`);
  console.log(`Total: ${cricketMatches.length + footballMatches.length}`);
  console.log('');
  
  if (cricketMatches.length === 0 && footballMatches.length === 0) {
    console.log('⚠️  No upcoming or recent matches found');
    console.log('   Checked matches starting in next 24 hours or started in last 2 hours');
  }
}

main().catch(console.error);



