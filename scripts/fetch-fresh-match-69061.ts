/**
 * Script to fetch fresh data for match 69061 and update database
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CricketService } from '../src/modules/cricket/cricket.service';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../src/modules/cricket/utils/match-transformers';

async function fetchAndUpdateMatch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cricketService = app.get(CricketService);
  const sportsMonksService = app.get(SportsMonksService);

  try {
    console.log('🔍 Fetching fresh data for match 69061...\n');

    // Try to get match from fixtures endpoint with full details
    const baseUrl = 'https://cricket.sportmonks.com/api/v2.0';
    const apiToken = process.env.SPORTSMONKS_API_TOKEN;
    
    if (!apiToken) {
      console.log('❌ SPORTSMONKS_API_TOKEN not set');
      return;
    }

    console.log('Fetching from fixtures endpoint...');
    const response = await fetch(
      `${baseUrl}/fixtures/69061?api_token=${apiToken}&include=scoreboards,localteam,visitorteam,venue,batting,bowling`
    );

    if (!response.ok) {
      console.log(`❌ API request failed: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const apiMatch = data.data;

    console.log('\n=== Raw API Match Data ===\n');
    console.log('Match ID:', apiMatch.id);
    console.log('State ID:', apiMatch.state_id);
    console.log('Status:', apiMatch.status);
    console.log('Starting At:', apiMatch.starting_at);
    console.log('Ending At:', apiMatch.ending_at);
    
    console.log('\n=== Scoreboards ===\n');
    if (apiMatch.scoreboards && Array.isArray(apiMatch.scoreboards)) {
      apiMatch.scoreboards.forEach((sb: any, i: number) => {
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

    // Transform the match
    console.log('\n=== Transforming Match ===\n');
    const transformedMatch = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
    
    console.log('Transformed Match:');
    console.log('  Status:', transformedMatch.status);
    console.log('  Home Score:', transformedMatch.currentScore?.home);
    console.log('  Away Score:', transformedMatch.currentScore?.away);
    console.log('  Result:', transformedMatch.result);

    // Calculate result
    if (transformedMatch.status === 'completed' && transformedMatch.currentScore) {
      const result = cricketService['calculateMatchResultFromData'](transformedMatch);
      console.log('\nCalculated Result:', result);
      transformedMatch.result = result;
    }

    // Save to database
    console.log('\n=== Saving to Database ===\n');
    await cricketService['saveMatchToDatabase'](transformedMatch);
    
    console.log('✅ Match updated in database');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

fetchAndUpdateMatch();












