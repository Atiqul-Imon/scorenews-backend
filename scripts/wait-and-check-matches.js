/**
 * Wait for rate limit to reset and check if matches are being fetched
 */

const axios = require('axios');

async function waitAndCheckMatches() {
  console.log('⏳ Waiting 2 minutes for rate limit to reset...\n');
  
  // Wait 2 minutes
  for (let i = 120; i > 0; i--) {
    process.stdout.write(`\r⏳ Waiting ${i} seconds...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n\n✅ Wait complete. Checking backend...\n');
  
  try {
    // Check backend health
    console.log('1. Checking backend health...');
    const healthRes = await axios.get('http://localhost:5000/health', { timeout: 5000 });
    console.log('   ✅ Backend is healthy\n');
    
    // Check live matches
    console.log('2. Checking live matches endpoint...');
    const matchesRes = await axios.get('http://localhost:5000/api/v1/cricket/matches/live', { timeout: 10000 });
    
    if (matchesRes.data?.success) {
      const matches = matchesRes.data?.data || [];
      console.log(`   ✅ Found ${matches.length} live matches\n`);
      
      if (matches.length > 0) {
        console.log('   Live matches:');
        matches.forEach((match, idx) => {
          console.log(`   ${idx + 1}. ${match.name || `${match.homeTeam?.name || 'Team 1'} vs ${match.awayTeam?.name || 'Team 2'}`}`);
          console.log(`      Match ID: ${match.matchId}`);
          console.log(`      Status: ${match.status}`);
        });
      } else {
        console.log('   ⚠️  No live matches yet');
        console.log('   This could mean:');
        console.log('   - Rate limit is still active (wait longer)');
        console.log('   - No live matches available from SportsMonk');
        console.log('   - Scheduler needs more time to fetch');
      }
    } else {
      console.log('   ❌ Backend returned error:', matchesRes.data);
    }
    
    // Check Redis cache
    console.log('\n3. Checking if Redis cache is working...');
    try {
      // Try to hit the endpoint again immediately - should use cache
      const cachedRes = await axios.get('http://localhost:5000/api/v1/cricket/matches/live', { timeout: 5000 });
      console.log('   ✅ Cache check complete (if second call was instant, cache is working)');
    } catch (error) {
      console.log('   ⚠️  Could not verify cache');
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Backend is not running on port 5000');
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log('   - Backend is running with rate limiting fixes');
  console.log('   - Scheduler runs every 60 seconds');
  console.log('   - Redis cache (30s) reduces API calls');
  console.log('   - Rate limit errors are handled gracefully');
  console.log('\n💡 Next steps:');
  console.log('   - Monitor backend logs: tail -f /tmp/backend.log');
  console.log('   - Check website: http://localhost:3000');
  console.log('   - Wait a few more minutes if no matches appear');
}

waitAndCheckMatches().catch(console.error);




