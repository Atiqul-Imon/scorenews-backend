import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';
import { transformSportsMonksMatchToFrontend } from '../src/modules/cricket/utils/match-transformers';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CricketMatch } from '../src/modules/cricket/schemas/cricket-match.schema';
import { getModelToken } from '@nestjs/mongoose';

async function fixMatchResult() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sportsMonksService = app.get(SportsMonksService);
  const cricketMatchModel = app.get<Model<any>>(getModelToken(CricketMatch.name));

  const matchId = '66046'; // South Africa vs West Indies

  try {
    console.log('🔧 Fixing Match 66046 Result\n');
    console.log('='.repeat(80));

    // 1. Fetch fresh data from API
    console.log('\n📥 Fetching fresh data from SportsMonks API...');
    const apiMatch = await sportsMonksService.getMatchDetails(matchId, 'cricket');
    
    console.log(`- Local Team: ${typeof apiMatch.localteam === 'object' ? apiMatch.localteam?.name : apiMatch.localteam} (ID: ${apiMatch.localteam_id})`);
    console.log(`- Visitor Team: ${typeof apiMatch.visitorteam === 'object' ? apiMatch.visitorteam?.name : apiMatch.visitorteam} (ID: ${apiMatch.visitorteam_id})`);
    console.log(`- Winner Team ID (from API): ${apiMatch.winner_team_id || 'N/A'}`);
    console.log(`- Status: ${apiMatch.status || 'N/A'}`);

    // 2. Transform the data
    console.log('\n🔄 Transforming data...');
    const transformed = transformSportsMonksMatchToFrontend(apiMatch, 'cricket');
    
    console.log(`- Home Team: ${transformed.teams?.home?.name} (${transformed.teams?.home?.shortName})`);
    console.log(`- Away Team: ${transformed.teams?.away?.name} (${transformed.teams?.away?.shortName})`);
    console.log(`- Home Score: ${transformed.currentScore?.home?.runs}/${transformed.currentScore?.home?.wickets} (${transformed.currentScore?.home?.overs} ov)`);
    console.log(`- Away Score: ${transformed.currentScore?.away?.runs}/${transformed.currentScore?.away?.wickets} (${transformed.currentScore?.away?.overs} ov)`);
    console.log(`- Calculated Result: ${transformed.result?.resultText || 'N/A'}`);

    // 3. Check if API provides winner_team_id
    if (apiMatch.winner_team_id) {
      console.log(`\n✅ API provides winner_team_id: ${apiMatch.winner_team_id}`);
      const winnerIsHome = apiMatch.winner_team_id === apiMatch.localteam_id;
      const winnerIsAway = apiMatch.winner_team_id === apiMatch.visitorteam_id;
      
      if (winnerIsHome) {
        console.log(`- Winner is HOME team: ${transformed.teams?.home?.name}`);
      } else if (winnerIsAway) {
        console.log(`- Winner is AWAY team: ${transformed.teams?.away?.name}`);
      }
    }

    // 4. Calculate correct result manually
    console.log('\n🧮 Calculating correct result...');
    const homeRuns = transformed.currentScore?.home?.runs || 0;
    const awayRuns = transformed.currentScore?.away?.runs || 0;
    const homeWickets = transformed.currentScore?.home?.wickets ?? 10;
    const awayWickets = transformed.currentScore?.away?.wickets ?? 10;
    
    console.log(`Home: ${homeRuns} runs, ${homeWickets} wickets`);
    console.log(`Away: ${awayRuns} runs, ${awayWickets} wickets`);
    
    // Determine winner
    const homeWon = homeRuns > awayRuns;
    const winner = homeWon ? 'home' : 'away';
    const winnerName = homeWon ? transformed.teams?.home?.name : transformed.teams?.away?.name;
    const winnerScore = homeWon ? transformed.currentScore?.home : transformed.currentScore?.away;
    const winnerWickets = winnerScore?.wickets ?? 10;
    const margin = Math.abs(homeRuns - awayRuns);
    
    // Determine batting order from innings
    let firstInningsTeam: 'home' | 'away' | null = null;
    let secondInningsTeam: 'home' | 'away' | null = null;
    
    if (transformed.innings && transformed.innings.length >= 2) {
      const firstInnings = transformed.innings[0];
      const secondInnings = transformed.innings[1];
      
      if (firstInnings.team === transformed.teams?.home?.name) {
        firstInningsTeam = 'home';
        secondInningsTeam = 'away';
      } else if (firstInnings.team === transformed.teams?.away?.name) {
        firstInningsTeam = 'away';
        secondInningsTeam = 'home';
      }
    }
    
    // Calculate result text and correct margin
    let resultText = '';
    let marginType: 'runs' | 'wickets' = 'runs';
    let finalMargin = margin; // Default to run margin
    
    if (firstInningsTeam && secondInningsTeam) {
      if (winner === firstInningsTeam) {
        marginType = 'runs';
        finalMargin = margin;
        resultText = `${winnerName} won by ${margin} runs`;
      } else {
        if (winnerWickets < 10) {
          const wicketsRemaining = 10 - winnerWickets;
          marginType = 'wickets';
          finalMargin = wicketsRemaining; // Use wickets remaining, not run margin
          resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
        } else {
          marginType = 'runs';
          finalMargin = margin;
          resultText = `${winnerName} won by ${margin} runs`;
        }
      }
    } else {
      if (winnerWickets < 10) {
        const wicketsRemaining = 10 - winnerWickets;
        marginType = 'wickets';
        finalMargin = wicketsRemaining; // Use wickets remaining, not run margin
        resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
      } else {
        marginType = 'runs';
        finalMargin = margin;
        resultText = `${winnerName} won by ${margin} runs`;
      }
    }
    
    console.log(`\n✅ Correct Result: ${resultText}`);
    console.log(`- Winner: ${winnerName} (${winner})`);
    console.log(`- Margin: ${finalMargin} ${marginType}`);
    
    // 5. Update database
    console.log('\n💾 Updating database...');
    const result = {
      winner,
      winnerName,
      margin: finalMargin, // Use correct margin (runs or wickets)
      marginType,
      resultText,
    };
    
    await cricketMatchModel.updateOne(
      { matchId },
      {
        $set: {
          result,
          currentScore: transformed.currentScore,
          innings: transformed.innings,
        },
      }
    );
    
    console.log('✅ Database updated successfully!');
    console.log(`- New result: ${resultText}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

fixMatchResult();

