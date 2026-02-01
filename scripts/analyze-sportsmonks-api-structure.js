require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN not found');
  process.exit(1);
}

async function analyzeAPI() {
  console.log('🔍 Analyzing SportsMonks API v2.0 Structure\n');
  console.log('='.repeat(80));
  
  // 1. Analyze livescores endpoint
  console.log('\n1️⃣  LIVESCORES ENDPOINT (/livescores)');
  console.log('-'.repeat(80));
  try {
    const liveResponse = await fetch(`${SPORTSMONKS_BASE_URL}/livescores?api_token=${SPORTSMONKS_API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`);
    const liveData = await liveResponse.json();
    const liveMatches = liveData.data || [];
    
    console.log(`   Returns: ${liveMatches.length} matches`);
    if (liveMatches.length > 0) {
      const sample = liveMatches[0];
      console.log(`   Sample match structure:`);
      console.log(`     - id: ${sample.id}`);
      console.log(`     - live: ${sample.live}`);
      console.log(`     - state_id: ${sample.state_id} (3=live, 4=break, 5=finished, 6=abandoned)`);
      console.log(`     - status: ${sample.status || 'N/A'}`);
      console.log(`     - note: ${sample.note || 'N/A'}`);
      console.log(`     - starting_at: ${sample.starting_at || 'N/A'}`);
      console.log(`     - ending_at: ${sample.ending_at || 'N/A'}`);
      console.log(`     - Has scoreboards: ${!!sample.scoreboards}`);
      console.log(`     - Has localteam: ${!!sample.localteam}`);
      console.log(`     - Has visitorteam: ${!!sample.visitorteam}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // 2. Analyze fixtures endpoint
  console.log('\n2️⃣  FIXTURES ENDPOINT (/fixtures)');
  console.log('-'.repeat(80));
  try {
    const fixturesResponse = await fetch(`${SPORTSMONKS_BASE_URL}/fixtures?api_token=${SPORTSMONKS_API_TOKEN}&include=scoreboards,localteam,visitorteam&per_page=10`);
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.data || [];
    
    console.log(`   Returns: ${fixtures.length} matches`);
    if (fixtures.length > 0) {
      const liveMatch = fixtures.find(m => m.state_id === 3 || m.state_id === 4);
      const completedMatch = fixtures.find(m => m.state_id === 5 || m.state_id === 6);
      
      if (liveMatch) {
        console.log(`   Live match sample:`);
        console.log(`     - id: ${liveMatch.id}`);
        console.log(`     - state_id: ${liveMatch.state_id}`);
        console.log(`     - status: ${liveMatch.status || 'N/A'}`);
        console.log(`     - live: ${liveMatch.live}`);
        console.log(`     - note: ${liveMatch.note || 'N/A'}`);
      }
      
      if (completedMatch) {
        console.log(`   Completed match sample:`);
        console.log(`     - id: ${completedMatch.id}`);
        console.log(`     - state_id: ${completedMatch.state_id}`);
        console.log(`     - status: ${completedMatch.status || 'N/A'}`);
        console.log(`     - live: ${completedMatch.live}`);
        console.log(`     - note: ${completedMatch.note || 'N/A'}`);
      }
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // 3. Analyze fixture details endpoint
  console.log('\n3️⃣  FIXTURE DETAILS ENDPOINT (/fixtures/{id})');
  console.log('-'.repeat(80));
  try {
    // Try to get a completed match
    const detailsResponse = await fetch(`${SPORTSMONKS_BASE_URL}/fixtures/69102?api_token=${SPORTSMONKS_API_TOKEN}&include=localteam,visitorteam,scoreboards,batting,bowling,venue,league,season`);
    const detailsData = await detailsResponse.json();
    const match = detailsData.data;
    
    if (match) {
      console.log(`   Match structure:`);
      console.log(`     - id: ${match.id}`);
      console.log(`     - state_id: ${match.state_id}`);
      console.log(`     - status: ${match.status || 'N/A'}`);
      console.log(`     - live: ${match.live}`);
      console.log(`     - note: ${match.note || 'N/A'}`);
      console.log(`     - Has scoreboards: ${!!match.scoreboards} (${match.scoreboards?.length || 0} scoreboards)`);
      console.log(`     - Has batting: ${!!match.batting} (${Array.isArray(match.batting) ? match.batting.length : 'N/A'} entries)`);
      console.log(`     - Has bowling: ${!!match.bowling} (${Array.isArray(match.bowling) ? match.bowling.length : 'N/A'} entries)`);
      console.log(`     - Has league: ${!!match.league}`);
      console.log(`     - Has season: ${!!match.season}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // 4. State ID mapping
  console.log('\n4️⃣  STATE ID MAPPING');
  console.log('-'.repeat(80));
  console.log(`   1 = Not Started`);
  console.log(`   2 = Starting Soon`);
  console.log(`   3 = In Progress (LIVE)`);
  console.log(`   4 = Break/Paused (LIVE)`);
  console.log(`   5 = Finished (COMPLETED)`);
  console.log(`   6 = Abandoned/Cancelled (COMPLETED)`);
  
  console.log('\n✅ Analysis complete!\n');
}

analyzeAPI();





