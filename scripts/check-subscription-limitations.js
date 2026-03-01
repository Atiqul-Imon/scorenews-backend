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

async function checkSubscriptionAccess() {
  console.log('========================================');
  console.log('  CHECKING SUBSCRIPTION ACCESS');
  console.log('========================================');
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log('');

  // Test 1: Check /livescores endpoint
  console.log('=== TEST 1: /livescores Endpoint ===');
  try {
    const response = await axios.get(`${CRICKET_BASE_URL}/livescores`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });
    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Matches: ${response.data?.data?.length || 0}`);
    if (response.data?.data?.length === 0) {
      console.log('   ⚠️  Endpoint works but returns 0 matches (could be no live matches OR subscription limitation)');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      if (error.response.data.message?.message?.includes('subscription') || 
          error.response.data.message?.message?.includes('plan') ||
          error.response.data.message?.message?.includes('tier')) {
        console.log('   🔒 SUBSCRIPTION LIMITATION DETECTED');
      }
    }
  }

  // Test 2: Check /fixtures endpoint
  console.log('\n=== TEST 2: /fixtures Endpoint ===');
  try {
    const response = await axios.get(`${CRICKET_BASE_URL}/fixtures`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'localteam,visitorteam',
        per_page: 10,
      },
    });
    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Matches: ${response.data?.data?.length || 0}`);
    if (response.data?.data?.length > 0) {
      const firstMatch = response.data.data[0];
      console.log(`   Sample: ID ${firstMatch.id}, Date: ${firstMatch.starting_at}`);
      console.log(`   ⚠️  Note: Fixtures endpoint may return old/historical data on free tier`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      if (error.response.data.message?.message?.includes('subscription') || 
          error.response.data.message?.message?.includes('plan') ||
          error.response.data.message?.message?.includes('tier')) {
        console.log('   🔒 SUBSCRIPTION LIMITATION DETECTED');
      }
    }
  }

  // Test 3: Check /fixtures/{id} endpoint with a sample ID
  console.log('\n=== TEST 3: /fixtures/{id} Endpoint ===');
  try {
    // Try with a common match ID (if available)
    const testMatchId = '216'; // From previous fixtures check
    const response = await axios.get(`${CRICKET_BASE_URL}/fixtures/${testMatchId}`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'localteam,visitorteam,scoreboards',
      },
    });
    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Match found: ${response.data?.data ? 'Yes' : 'No'}`);
    if (response.data?.data) {
      console.log(`   Match ID: ${response.data.data.id}`);
      console.log(`   Name: ${response.data.data.name || 'N/A'}`);
      console.log(`   State ID: ${response.data.data.state_id}`);
      console.log(`   Status: ${response.data.data.status}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      if (error.response.data.message?.message?.includes('subscription') || 
          error.response.data.message?.message?.includes('plan') ||
          error.response.data.message?.message?.includes('tier')) {
        console.log('   🔒 SUBSCRIPTION LIMITATION DETECTED');
      }
    }
  }

  // Test 4: Check rate limit status
  console.log('\n=== TEST 4: Rate Limit Check ===');
  try {
    // Make multiple rapid calls to see if we hit rate limits
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.get(`${CRICKET_BASE_URL}/livescores`, {
          params: {
            api_token: CRICKET_API_TOKEN,
            include: 'localteam,visitorteam',
          },
        }).catch(err => ({ error: err }))
      );
    }
    const results = await Promise.all(promises);
    const successCount = results.filter(r => !r.error && r.status === 200).length;
    const rateLimitCount = results.filter(r => r.error?.response?.status === 400 && 
      r.error?.response?.data?.message?.message?.includes('Too Many Attempts')).length;
    
    console.log(`✅ Successful calls: ${successCount}/5`);
    if (rateLimitCount > 0) {
      console.log(`⚠️  Rate limit hits: ${rateLimitCount}/5`);
      console.log('   This indicates rate limiting is active');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test 5: Check what data is actually available
  console.log('\n=== TEST 5: Available Data Check ===');
  try {
    const response = await axios.get(`${CRICKET_BASE_URL}/fixtures`, {
      params: {
        api_token: CRICKET_API_TOKEN,
        include: 'localteam,visitorteam,scoreboards',
        per_page: 5,
      },
    });
    
    if (response.data?.data?.length > 0) {
      const match = response.data.data[0];
      console.log('✅ Sample match data structure:');
      console.log(`   Has localteam: ${!!match.localteam}`);
      console.log(`   Has visitorteam: ${!!match.visitorteam}`);
      console.log(`   Has scoreboards: ${!!match.scoreboards}`);
      console.log(`   Has batting: ${!!match.batting}`);
      console.log(`   Has bowling: ${!!match.bowling}`);
      console.log(`   Match date: ${match.starting_at}`);
      console.log(`   Match age: ${Math.floor((new Date() - new Date(match.starting_at)) / (1000 * 60 * 60 * 24))} days old`);
      
      if (match.starting_at && new Date(match.starting_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
        console.log('   ⚠️  WARNING: Matches are old (30+ days) - likely free tier limitation');
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log('\n=== SUBSCRIPTION TIER ANALYSIS ===');
  console.log('Based on the tests above:');
  console.log('');
  console.log('If /livescores returns 0 matches:');
  console.log('  - Could be no live matches (normal)');
  console.log('  - Could be free tier limitation (no access to live data)');
  console.log('');
  console.log('If /fixtures returns only old matches (2018-2020):');
  console.log('  - Likely free tier limitation');
  console.log('  - Free tier may only have access to historical data');
  console.log('');
  console.log('If you get 401/403 errors:');
  console.log('  - Authentication issue');
  console.log('  - Check API token');
  console.log('');
  console.log('If you get 400 errors with "Too Many Attempts":');
  console.log('  - Rate limiting active');
  console.log('  - Free tier has lower rate limits');
}

checkSubscriptionAccess().catch(console.error);



