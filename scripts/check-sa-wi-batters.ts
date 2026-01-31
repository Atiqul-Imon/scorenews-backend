import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkSABatters() {
  try {
    if (!API_TOKEN) {
      console.error('❌ SPORTMONKS_API_TOKEN is not set in .env file');
      process.exit(1);
    }

    console.log('🔍 Fetching live matches from SportsMonks API...\n');
    
    // Call livescores endpoint
    const response = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });

    if (response.data?.status === 'error') {
      console.error('❌ API Error:', response.data.message);
      process.exit(1);
    }

    const matches = response.data?.data || [];
    console.log(`📊 Found ${matches.length} live matches\n`);

    // Find South Africa vs West Indies match
    const saWiMatch = matches.find((match: any) => {
      const localName = match.localteam?.name?.toLowerCase() || '';
      const visitorName = match.visitorteam?.name?.toLowerCase() || '';
      const matchName = match.name?.toLowerCase() || '';
      
      const hasSA = localName.includes('south africa') || visitorName.includes('south africa') || matchName.includes('south africa');
      const hasWI = localName.includes('west indies') || visitorName.includes('west indies') || matchName.includes('west indies');
      
      return hasSA && hasWI;
    });

    if (!saWiMatch) {
      console.log('❌ South Africa vs West Indies match not found in live matches');
      console.log('\n📋 Available matches:');
      matches.forEach((m: any) => {
        console.log(`  - ${m.name || `${m.localteam?.name || 'T1'} vs ${m.visitorteam?.name || 'T2'}`} (ID: ${m.id})`);
      });
      process.exit(1);
    }

    console.log('✅ Found match:');
    console.log(`   ID: ${saWiMatch.id}`);
    console.log(`   Name: ${saWiMatch.name || `${saWiMatch.localteam?.name} vs ${saWiMatch.visitorteam?.name}`}`);
    console.log(`   Status: ${saWiMatch.status}`);
    console.log(`   State ID: ${saWiMatch.state_id}`);
    console.log(`   Live: ${saWiMatch.live}\n`);

    // Now fetch full match details to get batting data
    console.log('🔍 Fetching full match details with batting data...\n');
    
    const detailResponse = await axios.get(`${BASE_URL}/fixtures/${saWiMatch.id}`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue,batting.batsman,bowling.bowler,batting.team,bowling.team',
      },
    });

    const matchDetails = detailResponse.data?.data;
    
    if (!matchDetails) {
      console.error('❌ Could not fetch match details');
      process.exit(1);
    }

    console.log('📊 MATCH DETAILS:');
    console.log(`   Status: ${matchDetails.status}`);
    console.log(`   Live: ${matchDetails.live}\n`);

    // Check scoreboards
    if (matchDetails.scoreboards && Array.isArray(matchDetails.scoreboards)) {
      console.log(`📋 Scoreboards: ${matchDetails.scoreboards.length}`);
      matchDetails.scoreboards.forEach((sb: any, idx: number) => {
        console.log(`\n   Scoreboard ${idx + 1}:`);
        console.log(`     Type: ${sb.type}`);
        console.log(`     Scoreboard: ${sb.scoreboard}`);
        console.log(`     Team ID: ${sb.team_id}`);
        console.log(`     Total: ${sb.total}`);
        console.log(`     Wickets: ${sb.wickets}`);
        console.log(`     Overs: ${sb.overs}`);
        console.log(`     Updated: ${sb.updated_at}`);
        
        // Check for partnership in scoreboard
        if (sb.partnership) {
          console.log(`     Partnership:`, JSON.stringify(sb.partnership, null, 6));
        }
        if (sb.partnership_runs !== undefined) {
          console.log(`     Partnership Runs: ${sb.partnership_runs}`);
        }
        if (sb.partnership_balls !== undefined) {
          console.log(`     Partnership Balls: ${sb.partnership_balls}`);
        }
      });
    }

    // Check batting data at root level
    console.log('\n🏏 BATTING DATA (Root Level):');
    if (matchDetails.batting && Array.isArray(matchDetails.batting)) {
      console.log(`   Total batting records: ${matchDetails.batting.length}\n`);
      
      // Filter for current/active batters
      const activeBatters = matchDetails.batting.filter((b: any) => {
        const isNotOut = !b.batsmanout_id || b.batsmanout_id === null || b.batsmanout_id === 0;
        const hasActivity = (b.score > 0 || b.ball > 0);
        const isActive = b.active === true;
        return isNotOut && (isActive || hasActivity);
      });

      console.log(`   Active/Current Batters: ${activeBatters.length}\n`);
      
      activeBatters.forEach((batter: any, idx: number) => {
        console.log(`   Batter ${idx + 1}:`);
        console.log(`     Player ID: ${batter.player_id || batter.batsman_id}`);
        console.log(`     Scoreboard: ${batter.scoreboard}`);
        console.log(`     Team ID: ${batter.team_id}`);
        console.log(`     Active: ${batter.active}`);
        console.log(`     Runs (score): ${batter.score}`);
        console.log(`     Balls: ${batter.ball}`);
        console.log(`     Fours: ${batter.four_x}`);
        console.log(`     Sixes: ${batter.six_x}`);
        console.log(`     Strike Rate: ${batter.rate}`);
        console.log(`     Batsmanout ID: ${batter.batsmanout_id}`);
        
        // Check for player/batsman name
        if (batter.player) {
          console.log(`     Player Name (from player): ${batter.player.fullname || batter.player.name || JSON.stringify(batter.player)}`);
        }
        if (batter.batsman) {
          console.log(`     Batsman Name (from batsman): ${batter.batsman.fullname || batter.batsman.name || JSON.stringify(batter.batsman)}`);
        }
        console.log('');
      });

      // Show all batting records for reference
      console.log('\n📋 ALL BATTING RECORDS (Full Details):');
      matchDetails.batting.forEach((batter: any, idx: number) => {
        console.log(`\n   Record ${idx + 1}:`);
        console.log(`     Player ID: ${batter.player_id || batter.batsman_id}`);
        console.log(`     Scoreboard: ${batter.scoreboard}`);
        console.log(`     Runs: ${batter.score}`);
        console.log(`     Balls: ${batter.ball}`);
        console.log(`     Active: ${batter.active}`);
        console.log(`     Batsmanout ID: ${batter.batsmanout_id || 'null'}`);
        console.log(`     Catch/Stump Player ID: ${batter.catch_stump_player_id || 'null'}`);
        console.log(`     Runout By ID: ${batter.runout_by_id || 'null'}`);
        console.log(`     Wicket ID: ${batter.wicket_id || 'null'}`);
        console.log(`     All Keys: ${Object.keys(batter).join(', ')}`);
        console.log(`     Full Record: ${JSON.stringify(batter, null, 6)}`);
      });
    } else {
      console.log('   No batting data at root level');
    }

    // Check batting data in scoreboards
    console.log('\n🏏 BATTING DATA (In Scoreboards):');
    if (matchDetails.scoreboards) {
      matchDetails.scoreboards.forEach((sb: any, sbIdx: number) => {
        if (sb.batting && Array.isArray(sb.batting)) {
          console.log(`\n   Scoreboard ${sbIdx + 1} (${sb.scoreboard || sb.type}):`);
          console.log(`     Batting records: ${sb.batting.length}`);
          
          const activeBatters = sb.batting.filter((b: any) => {
            const isNotOut = !b.batsmanout_id || b.batsmanout_id === null || b.batsmanout_id === 0;
            const hasActivity = (b.score > 0 || b.ball > 0);
            const isActive = b.active === true;
            return isNotOut && (isActive || hasActivity);
          });

          activeBatters.forEach((batter: any, idx: number) => {
            console.log(`\n     Batter ${idx + 1}:`);
            console.log(`       Runs: ${batter.score}`);
            console.log(`       Balls: ${batter.ball}`);
            console.log(`       Active: ${batter.active}`);
            console.log(`       Out: ${batter.batsmanout_id ? 'Yes' : 'No'}`);
          });
        }
      });
    }

    console.log('\n✅ Check complete!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

checkSABatters();

