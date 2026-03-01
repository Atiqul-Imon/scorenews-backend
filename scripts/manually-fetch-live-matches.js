/**
 * Manually trigger live matches fetch after waiting for rate limit to reset
 */

const axios = require('axios');

async function manuallyFetchLiveMatches() {
  console.log('🔄 Manually Triggering Live Matches Fetch\n');
  
  // Wait 2 minutes for rate limit to reset
  console.log('⏳ Waiting 2 minutes for rate limit to reset...\n');
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  try {
    // Call the backend endpoint that triggers a manual update
    // First check if there's an admin endpoint, otherwise use the regular endpoint
    const backendUrl = 'http://localhost:5000/api/v1/cricket/matches/live';
    console.log('Fetching from backend to trigger update...');
    
    const response = await axios.get(backendUrl, { timeout: 30000 });
    
    if (response.data?.success) {
      const matches = response.data?.data || [];
      console.log(`✅ Backend returned ${matches.length} live matches\n`);
      
      if (matches.length > 0) {
        console.log('Live matches found:');
        matches.forEach((match, idx) => {
          console.log(`\n${idx + 1}. ${match.name || `${match.homeTeam?.name || 'Team 1'} vs ${match.awayTeam?.name || 'Team 2'}`}`);
          console.log(`   Match ID: ${match.matchId}`);
          console.log(`   Status: ${match.status}`);
          console.log(`   Format: ${match.format}`);
        });
      } else {
        console.log('❌ No live matches returned');
        console.log('\nThis could mean:');
        console.log('1. Rate limit is still active - wait longer');
        console.log('2. No live matches available from SportsMonk API');
        console.log('3. Backend scheduler needs to run');
      }
    } else {
      console.log('❌ Backend returned error:', response.data);
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ Error: ${error.message}`);
      console.log('   (Backend might not be running)');
    }
  }
}

manuallyFetchLiveMatches().catch(console.error);




