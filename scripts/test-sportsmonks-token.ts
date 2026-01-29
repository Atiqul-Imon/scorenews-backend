import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPORTMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN;

async function testToken() {
  if (!SPORTMONKS_API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found in .env');
    process.exit(1);
  }

  console.log(`Token: ${SPORTMONKS_API_TOKEN.substring(0, 20)}...\n`);

  // Test v2.0 livescores endpoint
  console.log('1️⃣ Testing v2.0 livescores endpoint...');
  try {
    const response = await axios.get('https://cricket.sportmonks.com/api/v2.0/livescores', {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam',
      },
    });

    if (response.data?.status === 'error') {
      console.log(`   ❌ Error: ${response.data.message?.message || response.data.message}`);
    } else {
      const matches = response.data?.data || [];
      console.log(`   ✅ Success! Found ${matches.length} matches\n`);
      if (matches.length > 0) {
        matches.forEach((m: any) => {
          console.log(`   - ${m.localteam?.name} vs ${m.visitorteam?.name} (ID: ${m.id}, state_id: ${m.state_id})`);
        });
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.response?.status} - ${error.response?.data?.message?.message || error.message}`);
  }

  // Test v2.0 fixtures endpoint
  console.log('\n2️⃣ Testing v2.0 fixtures endpoint...');
  try {
    const response = await axios.get('https://cricket.sportmonks.com/api/v2.0/fixtures', {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam',
        per_page: 10,
      },
    });

    if (response.data?.status === 'error') {
      console.log(`   ❌ Error: ${response.data.message?.message || response.data.message}`);
    } else {
      const matches = response.data?.data || [];
      console.log(`   ✅ Success! Found ${matches.length} matches\n`);
      
      // Filter for live matches (state_id 3 or 4)
      const liveMatches = matches.filter((m: any) => m.state_id === 3 || m.state_id === 4);
      console.log(`   Found ${liveMatches.length} live matches (state_id 3 or 4):\n`);
      liveMatches.forEach((m: any) => {
        console.log(`   - ${m.localteam?.name} vs ${m.visitorteam?.name} (ID: ${m.id}, state_id: ${m.state_id})`);
      });
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.response?.status} - ${error.response?.data?.message?.message || error.message}`);
  }
}

testToken();

