import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPORTMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const MATCH_ID = '66046'; // South Africa vs West Indies

async function testCommentary() {
  if (!SPORTMONKS_API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found in .env');
    process.exit(1);
  }

  console.log(`🔍 Testing Commentary API for match ${MATCH_ID}...\n`);

  // Test 1: Fixtures endpoint with commentaries include
  console.log('1️⃣ Testing fixtures endpoint with commentaries include...');
  try {
    const response = await axios.get(`https://cricket.sportmonks.com/api/v2.0/fixtures/${MATCH_ID}`, {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'commentaries',
      },
    });

    if (response.data?.status === 'error') {
      console.log(`   ❌ Error: ${response.data.message?.message || response.data.message}`);
    } else {
      const match = response.data?.data;
      console.log(`   ✅ Success!`);
      console.log(`   Match: ${match?.localteam?.name} vs ${match?.visitorteam?.name}`);
      console.log(`   Has commentaries: ${match?.commentaries != null}`);
      console.log(`   Commentaries type: ${typeof match?.commentaries}`);
      if (Array.isArray(match?.commentaries)) {
        console.log(`   Commentaries count: ${match.commentaries.length}`);
        if (match.commentaries.length > 0) {
          console.log(`   Sample commentary:`, JSON.stringify(match.commentaries[0], null, 2));
        }
      } else if (match?.commentaries) {
        console.log(`   Commentaries data:`, JSON.stringify(match.commentaries, null, 2).substring(0, 500));
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.response?.status} - ${error.response?.data?.message?.message || error.message}`);
  }

  // Test 2: Commentaries endpoint
  console.log('\n2️⃣ Testing commentaries/fixtures endpoint...');
  try {
    const response = await axios.get(`https://cricket.sportmonks.com/api/v2.0/commentaries/fixtures/${MATCH_ID}`, {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'comments',
      },
    });

    if (response.data?.status === 'error') {
      console.log(`   ❌ Error: ${response.data.message?.message || response.data.message}`);
    } else {
      const commentary = response.data?.data || [];
      console.log(`   ✅ Success! Found ${commentary.length} commentary entries`);
      if (commentary.length > 0) {
        console.log(`   Sample commentary:`, JSON.stringify(commentary[0], null, 2));
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.response?.status} - ${error.response?.data?.message?.message || error.message}`);
    if (error.response?.data) {
      console.log(`   Response:`, JSON.stringify(error.response.data, null, 2).substring(0, 300));
    }
  }

  // Test 3: Check what includes are available
  console.log('\n3️⃣ Checking available includes for fixtures...');
  try {
    const response = await axios.get(`https://cricket.sportmonks.com/api/v2.0/fixtures/${MATCH_ID}`, {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
      },
    });

    if (response.data?.data) {
      console.log(`   Available keys:`, Object.keys(response.data.data).join(', '));
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
}

testCommentary();














