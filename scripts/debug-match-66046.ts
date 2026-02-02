import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../src/modules/cricket/utils/match-transformers';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CricketMatch } from '../src/modules/cricket/schemas/cricket-match.schema';
import { getModelToken } from '@nestjs/mongoose';

async function debugMatch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sportsMonksService = app.get(SportsMonksService);
  const cricketMatchModel = app.get<Model<any>>(getModelToken(CricketMatch.name));

  const matchId = '66046'; // South Africa vs West Indies

  try {
    console.log('🔍 Debugging Match 66046 (South Africa vs West Indies)\n');
    console.log('='.repeat(80));

    // 1. Check database
    console.log('\n📊 1. DATABASE DATA:');
    const dbMatch = await cricketMatchModel.findOne({ matchId });
    if (dbMatch) {
      console.log('Match found in database:');
      console.log(`- Status: ${dbMatch.status}`);
      console.log(`- Home Team: ${dbMatch.teams?.home?.name} (${dbMatch.teams?.home?.shortName})`);
      console.log(`- Away Team: ${dbMatch.teams?.away?.name} (${dbMatch.teams?.away?.shortName})`);
      console.log(`- Home Score: ${dbMatch.currentScore?.home?.runs}/${dbMatch.currentScore?.home?.wickets} (${dbMatch.currentScore?.home?.overs} ov)`);
      console.log(`- Away Score: ${dbMatch.currentScore?.away?.runs}/${dbMatch.currentScore?.away?.wickets} (${dbMatch.currentScore?.away?.overs} ov)`);
      console.log(`- Result: ${dbMatch.result?.resultText || 'N/A'}`);
      console.log(`- Winner: ${dbMatch.result?.winnerName || 'N/A'} (${dbMatch.result?.winner || 'N/A'})`);
      console.log(`- Margin: ${dbMatch.result?.margin || 'N/A'} ${dbMatch.result?.marginType || 'N/A'}`);
      if (dbMatch.innings && dbMatch.innings.length > 0) {
        console.log('\nInnings Data:');
        dbMatch.innings.forEach((inn: any, idx: number) => {
          console.log(`  Innings ${idx + 1}: ${inn.team} - ${inn.runs}/${inn.wickets} (${inn.overs} ov)`);
        });
      }
    } else {
      console.log('❌ Match not found in database');
    }

    // 2. Fetch from API
    console.log('\n\n🌐 2. API DATA (Fixtures Endpoint):');
    const apiMatch = await sportsMonksService.getMatchDetails(matchId, 'cricket');
    
    console.log('\nRaw API Response:');
    console.log(`- ID: ${apiMatch.id}`);
    console.log(`- Name: ${apiMatch.name}`);
    console.log(`- Local Team ID: ${apiMatch.localteam_id}`);
    console.log(`- Visitor Team ID: ${apiMatch.visitorteam_id}`);
    console.log(`- Local Team: ${typeof apiMatch.localteam === 'object' ? apiMatch.localteam?.name : apiMatch.localteam}`);
    console.log(`- Visitor Team: ${typeof apiMatch.visitorteam === 'object' ? apiMatch.visitorteam?.name : apiMatch.visitorteam}`);
    console.log(`- State ID: ${apiMatch.state_id}`);
    console.log(`- Status: ${apiMatch.status || 'N/A'}`);
    
    if (apiMatch.scoreboards && Array.isArray(apiMatch.scoreboards)) {
      console.log('\nScoreboards:');
      apiMatch.scoreboards.forEach((sb: any, idx: number) => {
        console.log(`  Scoreboard ${idx + 1}:`);
        console.log(`    - Team ID: ${sb.team_id}`);
        console.log(`    - Type: ${sb.type}`);
        console.log(`    - Scoreboard: ${sb.scoreboard}`);
        console.log(`    - Total: ${sb.total}`);
        console.log(`    - Wickets: ${sb.wickets}`);
        console.log(`    - Overs: ${sb.overs}`);
        console.log(`    - Balls: ${sb.balls}`);
      });
    }

    // 3. Transform and check
    console.log('\n\n🔄 3. TRANSFORMED DATA:');
    const transformed = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
    
    console.log(`- Home Team: ${transformed.teams?.home?.name} (${transformed.teams?.home?.shortName})`);
    console.log(`- Away Team: ${transformed.teams?.away?.name} (${transformed.teams?.away?.shortName})`);
    console.log(`- Home Score: ${transformed.currentScore?.home?.runs}/${transformed.currentScore?.home?.wickets} (${transformed.currentScore?.home?.overs} ov)`);
    console.log(`- Away Score: ${transformed.currentScore?.away?.runs}/${transformed.currentScore?.away?.wickets} (${transformed.currentScore?.away?.overs} ov)`);
    console.log(`- Result: ${transformed.result?.resultText || 'N/A'}`);
    console.log(`- Winner: ${transformed.result?.winnerName || 'N/A'} (${transformed.result?.winner || 'N/A'})`);
    console.log(`- Margin: ${transformed.result?.margin || 'N/A'} ${transformed.result?.marginType || 'N/A'}`);
    
    if (transformed.innings && transformed.innings.length > 0) {
      console.log('\nInnings Data:');
      transformed.innings.forEach((inn: any, idx: number) => {
        console.log(`  Innings ${idx + 1}: ${inn.team} - ${inn.runs}/${inn.wickets} (${inn.overs} ov)`);
      });
    }

    // 4. Expected result
    console.log('\n\n✅ 4. EXPECTED RESULT:');
    console.log('According to user:');
    console.log('- South Africa won by 7 wickets');
    console.log('- West Indies: 221/4 (20.0 ov)');
    console.log('- South Africa: 225/3 (17.3 ov)');
    
    // 5. Analysis
    console.log('\n\n🔬 5. ANALYSIS:');
    const homeRuns = transformed.currentScore?.home?.runs || 0;
    const awayRuns = transformed.currentScore?.away?.runs || 0;
    const homeWickets = transformed.currentScore?.home?.wickets ?? 10;
    const awayWickets = transformed.currentScore?.away?.wickets ?? 10;
    
    console.log(`Home runs: ${homeRuns}, Away runs: ${awayRuns}`);
    console.log(`Home wickets: ${homeWickets}, Away wickets: ${awayWickets}`);
    
    if (homeRuns > awayRuns) {
      console.log(`✅ Home team (${transformed.teams?.home?.name}) has more runs`);
      if (homeWickets < 10) {
        console.log(`✅ Home team has wickets remaining (${10 - homeWickets}), likely batted second`);
        console.log(`Expected: ${transformed.teams?.home?.name} won by ${10 - homeWickets} wickets`);
      }
    } else if (awayRuns > homeRuns) {
      console.log(`✅ Away team (${transformed.teams?.away?.name}) has more runs`);
      if (awayWickets < 10) {
        console.log(`✅ Away team has wickets remaining (${10 - awayWickets}), likely batted second`);
        console.log(`Expected: ${transformed.teams?.away?.name} won by ${10 - awayWickets} wickets`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

debugMatch();














