require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN not found in environment variables');
  process.exit(1);
}

async function checkLivescoresEndpoint() {
  try {
    console.log('🔍 Checking livescores endpoint for completed matches...\n');

    const includeParam = 'scoreboards,localteam,visitorteam,venue';
    const url = `${SPORTSMONKS_BASE_URL}/livescores?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
    
    console.log('📡 Fetching from livescores endpoint...');
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const matches = data.data || [];

    console.log(`\n📊 Found ${matches.length} matches in livescores endpoint\n`);

    // Find our specific matches
    const targetMatchIds = ['69102', '67847'];
    const foundMatches = matches.filter(m => targetMatchIds.includes(m.id?.toString()));

    if (foundMatches.length === 0) {
      console.log('✅ Good news: These matches are NOT in the livescores endpoint (they should be in fixtures only)');
      console.log('   This means they should not be fetched as live matches.');
    } else {
      console.log(`⚠️  Found ${foundMatches.length} completed match(es) in livescores endpoint:\n`);
      
      foundMatches.forEach(match => {
        console.log(`Match ID: ${match.id}`);
        console.log(`  Teams: ${match.localteam?.name} vs ${match.visitorteam?.name}`);
        console.log(`  Status: ${match.status || 'N/A'}`);
        console.log(`  Live: ${match.live !== undefined ? match.live : 'N/A'}`);
        console.log(`  State ID: ${match.state_id !== undefined ? match.state_id : 'N/A'}`);
        console.log(`  Note: ${match.note || 'N/A'}`);
        console.log('');
      });
    }

    // Check all matches for status inconsistencies
    const inconsistentMatches = matches.filter(m => {
      const hasFinishedStatus = m.status && (m.status.includes('Finished') || m.status.includes('Completed'));
      const hasResultNote = m.note && (m.note.toLowerCase().includes('won by') || m.note.toLowerCase().includes('tied'));
      const isLive = m.live === true;
      
      return (hasFinishedStatus || hasResultNote) && isLive;
    });

    if (inconsistentMatches.length > 0) {
      console.log(`\n⚠️  Found ${inconsistentMatches.length} match(es) with inconsistent status (Finished/Result but live=true):\n`);
      inconsistentMatches.forEach(m => {
        console.log(`  Match ${m.id}: ${m.localteam?.name} vs ${m.visitorteam?.name}`);
        console.log(`    Status: ${m.status || 'N/A'}`);
        console.log(`    Live: ${m.live}`);
        console.log(`    Note: ${m.note || 'N/A'}`);
        console.log('');
      });
    }

    console.log('✅ Check complete!');
    
  } catch (error) {
    console.error('❌ Error checking livescores endpoint:', error.message);
    console.error(error.stack);
  }
}

checkLivescoresEndpoint();




