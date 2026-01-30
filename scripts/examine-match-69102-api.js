require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const SPORTSMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.SPORTSMONKS_API_TOKEN;
// Use v2.0 API for cricket (same as the service)
const SPORTSMONKS_BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!SPORTSMONKS_API_TOKEN) {
  console.error('❌ SPORTMONKS_API_TOKEN not found in environment variables');
  process.exit(1);
}

async function examineMatch() {
  try {
    const matchId = '69102';
    console.log('🔍 Fetching match 69102 from SportsMonks API fixture endpoint...\n');
    console.log(`Base URL: ${SPORTSMONKS_BASE_URL}`);
    console.log(`Match ID: ${matchId}\n`);

    // Fetch from fixture endpoint with full includes
    const includeParam = 'localteam,visitorteam,scoreboards,batting,bowling,venue,league,season';
    const url = `${SPORTSMONKS_BASE_URL}/fixtures/${matchId}?api_token=${SPORTSMONKS_API_TOKEN}&include=${includeParam}`;
    
    console.log(`📡 Request URL: ${url.replace(SPORTSMONKS_API_TOKEN, '***')}\n`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text.substring(0, 500));
      return;
    }

    const data = await response.json();
    const apiMatch = data.data;

    if (!apiMatch) {
      console.error('❌ No match data returned from API');
      console.log('Full response:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('═'.repeat(80));
    console.log('📋 RAW API RESPONSE ANALYSIS');
    console.log('═'.repeat(80));

    console.log('\n🔑 KEY FIELDS:');
    console.log(`   Match ID: ${apiMatch.id}`);
    console.log(`   State ID: ${apiMatch.state_id} (3=live, 4=break, 5=finished, 6=abandoned)`);
    console.log(`   Status: ${apiMatch.status || 'N/A'}`);
    console.log(`   Live: ${apiMatch.live !== undefined ? apiMatch.live : 'N/A'}`);
    console.log(`   Starting At: ${apiMatch.starting_at || 'N/A'}`);
    console.log(`   Ending At: ${apiMatch.ending_at || 'N/A'}`);
    console.log(`   Type: ${apiMatch.type || 'N/A'}`);

    // Teams
    console.log('\n👥 TEAMS:');
    if (apiMatch.localteam) {
      console.log(`   Local Team: ${apiMatch.localteam.name} (ID: ${apiMatch.localteam.id})`);
    }
    if (apiMatch.visitorteam) {
      console.log(`   Visitor Team: ${apiMatch.visitorteam.name} (ID: ${apiMatch.visitorteam.id})`);
    }

    // Scoreboards
    console.log('\n📊 SCOREBOARDS:');
    if (apiMatch.scoreboards && Array.isArray(apiMatch.scoreboards)) {
      console.log(`   Found ${apiMatch.scoreboards.length} scoreboard(s)`);
      apiMatch.scoreboards.forEach((sb, idx) => {
        console.log(`\n   Scoreboard #${idx + 1}:`);
        console.log(`     ID: ${sb.id}`);
        console.log(`     Team ID: ${sb.team_id}`);
        console.log(`     Scoreboard: ${sb.scoreboard || 'N/A'}`);
        console.log(`     Total: ${sb.total || 0}`);
        console.log(`     Wickets: ${sb.wickets || 0}`);
        console.log(`     Overs: ${sb.overs || 0}`);
        console.log(`     Balls: ${sb.balls || 0}`);
        console.log(`     Score: ${sb.score || 'N/A'}`);
      });
    } else {
      console.log('   No scoreboards found');
    }

    // Current Score Analysis
    console.log('\n🎯 CURRENT SCORE ANALYSIS:');
    if (apiMatch.scoreboards && apiMatch.scoreboards.length >= 2) {
      const localTeamId = apiMatch.localteam?.id;
      const visitorTeamId = apiMatch.visitorteam?.id;
      
      const localScore = apiMatch.scoreboards.find(sb => sb.team_id === localTeamId);
      const visitorScore = apiMatch.scoreboards.find(sb => sb.team_id === visitorTeamId);
      
      if (localScore) {
        console.log(`   ${apiMatch.localteam?.name || 'Local'}:`);
        console.log(`     Runs: ${localScore.total || 0}`);
        console.log(`     Wickets: ${localScore.wickets || 0}`);
        console.log(`     Overs: ${localScore.overs || 0}`);
        console.log(`     All Out: ${(localScore.wickets || 0) >= 10 ? 'YES' : 'NO'}`);
      }
      
      if (visitorScore) {
        console.log(`   ${apiMatch.visitorteam?.name || 'Visitor'}:`);
        console.log(`     Runs: ${visitorScore.total || 0}`);
        console.log(`     Wickets: ${visitorScore.wickets || 0}`);
        console.log(`     Overs: ${visitorScore.overs || 0}`);
        console.log(`     All Out: ${(visitorScore.wickets || 0) >= 10 ? 'YES' : 'NO'}`);
      }

      // Determine match status based on scorecard
      const matchType = (apiMatch.type || '').toLowerCase();
      const isT20 = matchType.includes('t20');
      const isODI = matchType.includes('odi');
      const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;

      const localAllOut = (localScore?.wickets || 0) >= 10;
      const visitorAllOut = (visitorScore?.wickets || 0) >= 10;
      const localReachedMax = maxOvers !== undefined && (localScore?.overs || 0) >= maxOvers;
      const visitorReachedMax = maxOvers !== undefined && (visitorScore?.overs || 0) >= maxOvers;

      const bothInningsComplete = (localAllOut && visitorAllOut) || 
                                   (localReachedMax && visitorReachedMax) || 
                                   (localAllOut && visitorReachedMax) || 
                                   (visitorReachedMax && localAllOut);

      console.log('\n🔍 STATUS VERIFICATION:');
      console.log(`   API State ID: ${apiMatch.state_id} (${apiMatch.state_id === 5 || apiMatch.state_id === 6 ? 'COMPLETED' : 'NOT COMPLETED'})`);
      console.log(`   Local All Out: ${localAllOut}`);
      console.log(`   Visitor All Out: ${visitorAllOut}`);
      console.log(`   Local Reached Max Overs: ${localReachedMax} (${localScore?.overs || 0}/${maxOvers || 'N/A'})`);
      console.log(`   Visitor Reached Max Overs: ${visitorReachedMax} (${visitorScore?.overs || 0}/${maxOvers || 'N/A'})`);
      console.log(`   Both Innings Complete (by scorecard): ${bothInningsComplete ? 'YES' : 'NO'}`);
      
      if ((apiMatch.state_id === 5 || apiMatch.state_id === 6) && !bothInningsComplete) {
        console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
        console.log('   API says match is COMPLETED (state_id: ' + apiMatch.state_id + ')');
        console.log('   BUT scorecard shows match is still IN PROGRESS!');
        console.log('   This is a false positive - match should be LIVE');
      } else if (bothInningsComplete && (apiMatch.state_id !== 5 && apiMatch.state_id !== 6)) {
        console.log('\n⚠️  ⚠️  ⚠️  ISSUE DETECTED ⚠️  ⚠️  ⚠️');
        console.log('   Scorecard shows match is COMPLETED');
        console.log('   BUT API says match is NOT COMPLETED (state_id: ' + apiMatch.state_id + ')');
        console.log('   This might be a timing issue');
      } else {
        console.log('\n✅ Status verification: API and scorecard are consistent');
      }
    }

    // Batting/Bowling data
    console.log('\n🏏 BATTING/BOWLING DATA:');
    if (apiMatch.batting && Array.isArray(apiMatch.batting)) {
      console.log(`   Found ${apiMatch.batting.length} batting entries`);
    } else {
      console.log('   No batting data');
    }
    if (apiMatch.bowling && Array.isArray(apiMatch.bowling)) {
      console.log(`   Found ${apiMatch.bowling.length} bowling entries`);
    } else {
      console.log('   No bowling data');
    }

    // Full JSON (for debugging)
    console.log('\n' + '═'.repeat(80));
    console.log('📄 FULL API RESPONSE (JSON):');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(apiMatch, null, 2));

    console.log('\n✅ API examination complete!');
    
  } catch (error) {
    console.error('❌ Error examining match:', error.message);
    console.error(error.stack);
  }
}

examineMatch();

