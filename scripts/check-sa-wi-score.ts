import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPORTMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN;

async function checkScore() {
  if (!SPORTMONKS_API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found in .env');
    process.exit(1);
  }

  console.log('🔍 Checking South Africa vs West Indies match score...\n');

  try {
    const response = await axios.get('https://cricket.sportmonks.com/api/v2.0/livescores', {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,venue',
      },
    });

    if (response.data?.status === 'error') {
      console.log(`❌ Error: ${response.data.message?.message || response.data.message}`);
      return;
    }

    const matches = response.data?.data || [];
    const match = matches.find((m: any) => 
      (m.localteam?.name === 'South Africa' || m.visitorteam?.name === 'South Africa') &&
      (m.localteam?.name === 'West Indies' || m.visitorteam?.name === 'West Indies')
    );

    if (!match) {
      console.log('❌ Match not found');
      return;
    }

    console.log(`✅ Found match: ${match.localteam?.name} vs ${match.visitorteam?.name} (ID: ${match.id})\n`);
    console.log('📊 Scoreboards:\n');
    
    match.scoreboards?.forEach((sb: any, index: number) => {
      console.log(`Scoreboard ${index + 1}:`);
      console.log(`  Team ID: ${sb.team_id}`);
      console.log(`  Team: ${sb.team_id === match.localteam_id ? match.localteam?.name : match.visitorteam?.name}`);
      console.log(`  Scoreboard: ${sb.scoreboard}`);
      console.log(`  Type: ${sb.type}`);
      console.log(`  Total: ${sb.total}`);
      console.log(`  Runs (score): ${sb.score}`);
      console.log(`  Wickets (w): ${sb.w}`);
      console.log(`  Wickets (wickets): ${sb.wickets}`);
      console.log(`  Overs: ${sb.overs}`);
      console.log(`  Full object keys:`, Object.keys(sb));
      console.log('');
    });

    // Check which team is batting
    const battingTeam = match.scoreboards?.find((sb: any) => sb.overs > 0 && sb.total > 0);
    if (battingTeam) {
      const teamName = battingTeam.team_id === match.localteam_id 
        ? match.localteam?.name 
        : match.visitorteam?.name;
      console.log(`🏏 Currently batting: ${teamName}`);
      console.log(`   Score: ${battingTeam.total}/${battingTeam.w || battingTeam.wickets || 0}`);
      console.log(`   Overs: ${battingTeam.overs}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkScore();














