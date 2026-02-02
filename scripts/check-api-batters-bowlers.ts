import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkAPIBattersBowlers() {
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
        _t: Date.now(), // Cache buster
      },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
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

    // Now fetch full match details with batting/bowling data
    console.log('🔍 Fetching full match details with batting/bowling data...\n');
    
    const timestamp = Date.now();
    const detailResponse = await axios.get(`${BASE_URL}/fixtures/${saWiMatch.id}`, {
      params: {
        api_token: API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue,batting.batsman,bowling.bowler,batting.team,bowling.team',
        _t: timestamp, // Cache buster
      },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
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
      });
    }

    // Check batting data at root level
    console.log('\n🏏 BATTING DATA (Root Level):');
    if (matchDetails.batting && Array.isArray(matchDetails.batting)) {
      console.log(`   Total batting records: ${matchDetails.batting.length}\n`);
      
      // Show ALL batting records with full details
      matchDetails.batting.forEach((batter: any, idx: number) => {
        console.log(`\n   Batter ${idx + 1}:`);
        console.log(`     Player ID: ${batter.player_id || batter.batsman_id}`);
        console.log(`     Scoreboard: ${batter.scoreboard}`);
        console.log(`     Team ID: ${batter.team_id}`);
        console.log(`     Active: ${batter.active}`);
        console.log(`     Runs (score): ${batter.score}`);
        console.log(`     Balls: ${batter.ball}`);
        console.log(`     Fours: ${batter.four_x}`);
        console.log(`     Sixes: ${batter.six_x}`);
        console.log(`     Strike Rate: ${batter.rate}`);
        console.log(`     Batsmanout ID: ${batter.batsmanout_id || 'null'}`);
        console.log(`     Catch/Stump Player ID: ${batter.catch_stump_player_id || 'null'}`);
        console.log(`     Runout By ID: ${batter.runout_by_id || 'null'}`);
        console.log(`     Wicket ID: ${batter.wicket_id || 'null'}`);
        
        // Check for player/batsman name
        if (batter.player) {
          console.log(`     Player Name (from player): ${batter.player.fullname || batter.player.name || JSON.stringify(batter.player)}`);
        }
        if (batter.batsman) {
          console.log(`     Batsman Name (from batsman): ${batter.batsman.fullname || batter.batsman.name || JSON.stringify(batter.batsman)}`);
        }
        
        // Determine if out
        const hasBatsmanoutId = batter.batsmanout_id !== undefined && batter.batsmanout_id !== null && batter.batsmanout_id !== 0;
        const hasCatchStump = batter.catch_stump_player_id !== undefined && batter.catch_stump_player_id !== null && batter.catch_stump_player_id !== 0;
        const hasRunout = batter.runout_by_id !== undefined && batter.runout_by_id !== null && batter.runout_by_id !== 0;
        const isOut = hasBatsmanoutId || hasCatchStump || hasRunout;
        console.log(`     Is Out: ${isOut} (batsmanout: ${hasBatsmanoutId}, catch/stump: ${hasCatchStump}, runout: ${hasRunout})`);
      });

      // Filter for ACTIVE batters only
      const activeBatters = matchDetails.batting.filter((b: any) => {
        const isActive = b.active === true;
        const hasBatsmanoutId = b.batsmanout_id !== undefined && b.batsmanout_id !== null && b.batsmanout_id !== 0;
        const hasCatchStump = b.catch_stump_player_id !== undefined && b.catch_stump_player_id !== null && b.catch_stump_player_id !== 0;
        const hasRunout = b.runout_by_id !== undefined && b.runout_by_id !== null && b.runout_by_id !== 0;
        const isOut = hasBatsmanoutId || hasCatchStump || hasRunout;
        return isActive && !isOut;
      });

      console.log(`\n   ✅ ACTIVE & NOT OUT Batters: ${activeBatters.length}`);
      activeBatters.forEach((batter: any, idx: number) => {
        const name = batter.batsman?.fullname || batter.batsman?.name || batter.player?.fullname || batter.player?.name || `Player ${batter.player_id}`;
        console.log(`     ${idx + 1}. ${name}: ${batter.score}*${batter.ball} (SR: ${batter.rate}) - Scoreboard: ${batter.scoreboard}`);
      });
    } else {
      console.log('   No batting data at root level');
    }

    // Check bowling data at root level
    console.log('\n\n🎳 BOWLING DATA (Root Level):');
    if (matchDetails.bowling && Array.isArray(matchDetails.bowling)) {
      console.log(`   Total bowling records: ${matchDetails.bowling.length}\n`);
      
      // Show ALL bowling records with full details
      matchDetails.bowling.forEach((bowler: any, idx: number) => {
        console.log(`\n   Bowler ${idx + 1}:`);
        console.log(`     Player ID: ${bowler.player_id || bowler.bowler_id}`);
        console.log(`     Scoreboard: ${bowler.scoreboard}`);
        console.log(`     Team ID: ${bowler.team_id}`);
        console.log(`     Active: ${bowler.active}`);
        console.log(`     Overs: ${bowler.overs}`);
        console.log(`     Maidens: ${bowler.maidens}`);
        console.log(`     Runs: ${bowler.runs}`);
        console.log(`     Wickets: ${bowler.wickets}`);
        console.log(`     Economy: ${bowler.rate}`);
        
        // Check for player/bowler name
        if (bowler.player) {
          console.log(`     Player Name (from player): ${bowler.player.fullname || bowler.player.name || JSON.stringify(bowler.player)}`);
        }
        if (bowler.bowler) {
          console.log(`     Bowler Name (from bowler): ${bowler.bowler.fullname || bowler.bowler.name || JSON.stringify(bowler.bowler)}`);
        }
      });

      // Filter for ACTIVE bowlers only
      const activeBowlers = matchDetails.bowling.filter((b: any) => {
        const isActive = b.active === true;
        const hasOvers = b.overs > 0;
        return isActive && hasOvers;
      });

      console.log(`\n   ✅ ACTIVE Bowlers: ${activeBowlers.length}`);
      activeBowlers.forEach((bowler: any, idx: number) => {
        const name = bowler.bowler?.fullname || bowler.bowler?.name || bowler.player?.fullname || bowler.player?.name || `Player ${bowler.player_id}`;
        console.log(`     ${idx + 1}. ${name}: ${bowler.overs}-${bowler.maidens}-${bowler.runs}-${bowler.wickets} (Econ: ${bowler.rate}) - Scoreboard: ${bowler.scoreboard}`);
      });
    } else {
      console.log('   No bowling data at root level');
    }

    // Check batting/bowling in scoreboards
    console.log('\n\n📋 BATTING/BOWLING IN SCOREBOARDS:');
    if (matchDetails.scoreboards) {
      matchDetails.scoreboards.forEach((sb: any, sbIdx: number) => {
        console.log(`\n   Scoreboard ${sbIdx + 1} (${sb.scoreboard || sb.type}):`);
        console.log(`     Type: ${sb.type}`);
        console.log(`     Team ID: ${sb.team_id}`);
        console.log(`     Overs: ${sb.overs}`);
        console.log(`     Updated: ${sb.updated_at}`);
        
        if (sb.batting && Array.isArray(sb.batting)) {
          console.log(`     Batting records: ${sb.batting.length}`);
          const activeBatters = sb.batting.filter((b: any) => b.active === true);
          console.log(`     Active batters: ${activeBatters.length}`);
          activeBatters.forEach((b: any) => {
            const name = b.batsman?.fullname || b.batsman?.name || `Player ${b.player_id}`;
            console.log(`       - ${name}: ${b.score}*${b.ball} (Active: ${b.active})`);
          });
        }
        
        if (sb.bowling && Array.isArray(sb.bowling)) {
          console.log(`     Bowling records: ${sb.bowling.length}`);
          const activeBowlers = sb.bowling.filter((b: any) => b.active === true);
          console.log(`     Active bowlers: ${activeBowlers.length}`);
          activeBowlers.forEach((b: any) => {
            const name = b.bowler?.fullname || b.bowler?.name || `Player ${b.player_id}`;
            console.log(`       - ${name}: ${b.overs}-${b.maidens}-${b.runs}-${b.wickets} (Active: ${b.active})`);
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

checkAPIBattersBowlers();




