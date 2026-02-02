/**
 * Script to check the actual data from SportsMonks API for match 69061
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';

async function checkApiMatch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sportsMonksService = app.get(SportsMonksService);

  try {
    console.log('🔍 Fetching match 69061 from SportsMonks API...\n');

    // Try to get match details directly
    const baseUrl = 'https://cricket.sportmonks.com/api/v2.0';
    const apiToken = process.env.SPORTSMONKS_API_TOKEN;
    
    if (!apiToken) {
      console.log('❌ SPORTSMONKS_API_TOKEN not set');
      return;
    }

    // Fetch match details with full includes
    const response = await fetch(
      `${baseUrl}/fixtures/69061?api_token=${apiToken}&include=scoreboards,localteam,visitorteam,venue,batting,bowling`
    );

    if (!response.ok) {
      console.log(`❌ API request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log('Response:', text);
      return;
    }

    const data = await response.json();
    const match = data.data;

    console.log('\n=== Raw API Data ===\n');
    console.log('Match ID:', match.id);
    console.log('Status:', match.state_id, match.status);
    console.log('Starting At:', match.starting_at);
    console.log('Ending At:', match.ending_at);
    console.log('\n=== Scoreboards ===\n');
    
    if (match.scoreboards && Array.isArray(match.scoreboards)) {
      match.scoreboards.forEach((sb: any, i: number) => {
        console.log(`Scoreboard ${i + 1}:`);
        console.log('  Type:', sb.type);
        console.log('  Team ID:', sb.team_id);
        console.log('  Team Name:', sb.team?.name);
        console.log('  Score:', sb.score);
        console.log('  Total:', sb.total);
        console.log('  Wickets:', sb.wickets);
        console.log('  Overs:', sb.overs);
        console.log('  Balls:', sb.balls);
        console.log('');
      });
    }

    console.log('\n=== Batting ===\n');
    if (match.batting && Array.isArray(match.batting)) {
      match.batting.forEach((b: any, i: number) => {
        console.log(`Batsman ${i + 1}:`);
        console.log('  Player:', b.player?.name || b.player?.fullname);
        console.log('  Runs:', b.score);
        console.log('  Balls:', b.ball);
        console.log('  4s:', b.four_x);
        console.log('  6s:', b.six_x);
        console.log('  Out:', b.batsmanout?.name || 'Not out');
        console.log('');
      });
    }

    console.log('\n=== Bowling ===\n');
    if (match.bowling && Array.isArray(match.bowling)) {
      match.bowling.forEach((b: any, i: number) => {
        console.log(`Bowler ${i + 1}:`);
        console.log('  Player:', b.player?.name || b.player?.fullname);
        console.log('  Overs:', b.overs);
        console.log('  Maidens:', b.medians);
        console.log('  Runs:', b.runs);
        console.log('  Wickets:', b.wickets);
        console.log('  Economy:', b.rate);
        console.log('');
      });
    }

    // Also check completed matches endpoint
    console.log('\n=== Checking Completed Matches Endpoint ===\n');
    const completedMatches = await sportsMonksService.getCompletedMatches('cricket');
    const foundMatch = completedMatches.find((m: any) => m.id === 69061 || m.fixture_id === 69061);
    
    if (foundMatch) {
      console.log('✅ Found in completed matches:');
      console.log('  ID:', foundMatch.id || foundMatch.fixture_id);
      console.log('  Status:', foundMatch.state_id, foundMatch.status);
      if (foundMatch.scoreboards) {
        console.log('  Scoreboards:', JSON.stringify(foundMatch.scoreboards, null, 2));
      }
    } else {
      console.log('❌ Not found in completed matches');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

checkApiMatch();














