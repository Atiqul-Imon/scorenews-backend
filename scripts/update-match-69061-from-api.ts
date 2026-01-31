/**
 * Script to fetch fresh data for match 69061 from API and update database with correct scores
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CricketService } from '../src/modules/cricket/cricket.service';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../src/modules/cricket/utils/match-transformers';

async function updateMatch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cricketService = app.get(CricketService);
  const sportsMonksService = app.get(SportsMonksService);

  try {
    console.log('🔍 Fetching fresh data for match 69061 from SportsMonks API...\n');

    // Get match details using the service
    const baseUrl = sportsMonksService['getBaseUrl']('cricket');
    const apiToken = sportsMonksService['apiToken'];
    
    if (!apiToken) {
      console.log('❌ SPORTSMONKS_API_TOKEN not set');
      return;
    }

    // Fetch match from fixtures endpoint with full includes
    const response = await fetch(
      `${baseUrl}/fixtures/69061?api_token=${apiToken}&include=scoreboards,localteam,visitorteam,venue,batting,bowling`
    );

    if (!response.ok) {
      console.log(`❌ API request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log('Response:', text.substring(0, 500));
      return;
    }

    const data = await response.json();
    const apiMatch = data.data;

    console.log('\n=== Raw API Data ===\n');
    console.log('Match ID:', apiMatch.id);
    console.log('State ID:', apiMatch.state_id);
    console.log('Status:', apiMatch.status);
    console.log('Starting At:', apiMatch.starting_at);
    console.log('Ending At:', apiMatch.ending_at);
    
    console.log('\n=== Scoreboards (Raw) ===\n');
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
    console.log('  Home Team:', transformedMatch.teams?.home?.name);
    console.log('  Away Team:', transformedMatch.teams?.away?.name);
    console.log('  Home Score:', JSON.stringify(transformedMatch.currentScore?.home, null, 2));
    console.log('  Away Score:', JSON.stringify(transformedMatch.currentScore?.away, null, 2));

    // Ensure status is completed
    if (apiMatch.state_id === 5 || apiMatch.state_id === 6 || apiMatch.status?.includes('Finished')) {
      transformedMatch.status = 'completed';
      transformedMatch.matchEnded = true;
    }

    // Calculate result
    if (transformedMatch.status === 'completed' && transformedMatch.currentScore) {
      const result = cricketService['calculateMatchResultFromData'](transformedMatch);
      console.log('\nCalculated Result:', JSON.stringify(result, null, 2));
      transformedMatch.result = result;
    }

    // Save to database
    console.log('\n=== Saving to Database ===\n');
    await cricketService['saveMatchToDatabase'](transformedMatch);
    
    console.log('✅ Match updated in database with fresh data from API');

    // Verify the update
    console.log('\n=== Verifying Update ===\n');
    const updatedMatch = await cricketService['cricketMatchModel'].findOne({ matchId: '69061' }).lean();
    if (updatedMatch) {
      console.log('Updated Match in DB:');
      console.log('  Status:', updatedMatch.status);
      console.log('  Home Score:', JSON.stringify(updatedMatch.currentScore?.home, null, 2));
      console.log('  Away Score:', JSON.stringify(updatedMatch.currentScore?.away, null, 2));
      console.log('  Result:', JSON.stringify(updatedMatch.result, null, 2));
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

updateMatch();











