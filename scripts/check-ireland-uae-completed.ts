/**
 * Script to check if Ireland vs UAE match is saved in MongoDB
 * and verify it appears in getResults endpoint
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CricketService } from '../src/modules/cricket/cricket.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CricketMatch } from '../src/modules/cricket/schemas/cricket-match.schema';

async function checkMatch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cricketService = app.get(CricketService);
  const cricketMatchModel = app.get('CricketMatchModel') as Model<any>;

  try {
    console.log('🔍 Checking for Ireland vs UAE match in MongoDB...\n');

    // Search for the match by team names
    const dbMatches = await cricketMatchModel.find({
      $or: [
        { 'teams.home.name': { $regex: /ireland/i } },
        { 'teams.away.name': { $regex: /ireland/i } },
        { 'teams.home.name': { $regex: /uae|united arab emirates/i } },
        { 'teams.away.name': { $regex: /uae|united arab emirates/i } },
      ],
    }).sort({ startTime: -1 }).limit(10).lean();

    console.log(`Found ${dbMatches.length} matches with Ireland or UAE:\n`);

    dbMatches.forEach((match, index) => {
      console.log(`\n--- Match ${index + 1} ---`);
      console.log(`ID: ${match._id}`);
      console.log(`Match ID: ${match.matchId}`);
      console.log(`Status: ${match.status}`);
      console.log(`Teams: ${match.teams?.home?.name} vs ${match.teams?.away?.name}`);
      console.log(`Start Time: ${match.startTime}`);
      console.log(`End Time: ${match.endTime || 'N/A'}`);
      console.log(`Match Ended: ${match.matchEnded || false}`);
      console.log(`Result: ${match.result ? JSON.stringify(match.result) : 'N/A'}`);
      console.log(`Current Score: ${match.currentScore ? JSON.stringify(match.currentScore) : 'N/A'}`);
    });

    // Check getResults endpoint
    console.log('\n\n🔍 Checking getResults endpoint...\n');
    const results = await cricketService.getResults({ limit: 10 });
    
    // getResults returns { success: true, data: { results: [...], pagination: {...} } }
    const matches = results?.data?.results || [];
    
    console.log(`getResults returned ${matches.length} matches\n`);
    
    if (matches.length > 0) {
      const irelandUaeMatch = matches.find((m: any) => 
        (m.teams?.home?.name?.toLowerCase().includes('ireland') || 
         m.teams?.away?.name?.toLowerCase().includes('ireland')) &&
        (m.teams?.home?.name?.toLowerCase().includes('uae') || 
         m.teams?.away?.name?.toLowerCase().includes('united arab emirates'))
      );

      if (irelandUaeMatch) {
        console.log('✅ Ireland vs UAE match found in getResults:');
        console.log(JSON.stringify(irelandUaeMatch, null, 2));
      } else {
        console.log('❌ Ireland vs UAE match NOT found in getResults');
        console.log('\nFirst 5 matches from getResults:');
        matches.slice(0, 5).forEach((m: any, i: number) => {
          console.log(`${i + 1}. ${m.teams?.home?.name} vs ${m.teams?.away?.name} - ${m.status} - ${m.startTime}`);
        });
      }
    } else {
      console.log('❌ getResults returned no matches');
    }

    // Check all completed matches in database
    console.log('\n\n🔍 Checking all completed matches in database...\n');
    const completedMatches = await cricketMatchModel.find({
      status: 'completed',
    }).sort({ startTime: -1 }).limit(10).lean();

    console.log(`Found ${completedMatches.length} completed matches:\n`);
    completedMatches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.teams?.home?.name} vs ${match.teams?.away?.name} - ${match.startTime}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.close();
  }
}

checkMatch();

