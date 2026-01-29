/**
 * Script to fix Ireland vs UAE match status to completed
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CricketMatch } from '../src/modules/cricket/schemas/cricket-match.schema';

async function fixMatchStatus() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cricketMatchModel = app.get('CricketMatchModel') as Model<any>;

  try {
    console.log('🔍 Finding Ireland vs UAE match...\n');

    // Find the match
    const match: any = await cricketMatchModel.findOne({
      matchId: '69061',
    }).lean();

    if (!match) {
      console.log('❌ Match not found');
      return;
    }

    console.log('Current match status:');
    console.log(`- Status: ${match.status}`);
    console.log(`- Match Ended: ${match.matchEnded}`);
    console.log(`- Teams: ${match.teams?.home?.name} vs ${match.teams?.away?.name}`);
    console.log(`- Start Time: ${match.startTime}`);
    console.log(`- Current Score: ${JSON.stringify(match.currentScore, null, 2)}`);

    // Check if match should be completed
    // Both teams have batted (both have scores)
    const bothTeamsBatted = match.currentScore?.home?.runs !== undefined && 
                           match.currentScore?.away?.runs !== undefined;
    
    // Match has been going for more than 3 hours (T20 should be done)
    const startTime = new Date(match.startTime);
    const now = new Date();
    const hoursSinceStart = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const shouldBeCompleted = bothTeamsBatted && hoursSinceStart > 3;

    console.log(`\nMatch analysis:`);
    console.log(`- Both teams batted: ${bothTeamsBatted}`);
    console.log(`- Hours since start: ${hoursSinceStart.toFixed(2)}`);
    console.log(`- Should be completed: ${shouldBeCompleted}`);

    if (match.status === 'live' && shouldBeCompleted) {
      console.log('\n✅ Updating match status to completed...\n');
      
      // Calculate result
      const homeRuns = match.currentScore?.home?.runs || 0;
      const awayRuns = match.currentScore?.away?.runs || 0;
      const homeWickets = match.currentScore?.home?.wickets || 0;
      const awayWickets = match.currentScore?.away?.wickets || 0;
      
      let result: any = {};
      if (homeRuns > awayRuns) {
        result = {
          winner: 'home',
          winnerName: match.teams?.home?.name,
          margin: homeRuns - awayRuns,
          marginType: 'runs',
          resultText: `${match.teams?.home?.name} won by ${homeRuns - awayRuns} runs`,
        };
      } else if (awayRuns > homeRuns) {
        result = {
          winner: 'away',
          winnerName: match.teams?.away?.name,
          margin: awayRuns - homeRuns,
          marginType: 'runs',
          resultText: `${match.teams?.away?.name} won by ${awayRuns - homeRuns} runs`,
        };
      }

      // Update match
      await cricketMatchModel.updateOne(
        { matchId: '69061' },
        {
          $set: {
            status: 'completed',
            matchEnded: true,
            endTime: now,
            result: result,
          },
        }
      );

      console.log('✅ Match updated successfully!');
      console.log(`- New status: completed`);
      console.log(`- Result: ${result.resultText || 'N/A'}`);
    } else {
      console.log('\n⚠️  Match status is already correct or conditions not met');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.close();
  }
}

fixMatchStatus();

