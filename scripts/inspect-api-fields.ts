import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SportsMonksService } from '../src/modules/cricket/services/sportsmonks.service';

async function inspectApiFields() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sportsMonksService = app.get(SportsMonksService);

  const matchId = '66046'; // Completed match

  try {
    console.log('🔍 Inspecting SportsMonks API Fields for Completed Match\n');
    console.log('='.repeat(80));

    const apiMatch = await sportsMonksService.getMatchDetails(matchId, 'cricket');
    
    console.log('\n📋 ALL FIELDS IN API RESPONSE:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(apiMatch, null, 2));
    
    console.log('\n\n🎯 KEY FIELDS FOR COMPLETED MATCHES:');
    console.log('='.repeat(80));
    console.log(`- winner_team_id: ${apiMatch.winner_team_id || 'N/A'}`);
    console.log(`- status: ${apiMatch.status || 'N/A'}`);
    console.log(`- state_id: ${apiMatch.state_id || 'N/A'}`);
    console.log(`- note: ${apiMatch.note || 'N/A'}`);
    console.log(`- toss_won_team_id: ${apiMatch.toss_won_team_id || 'N/A'}`);
    console.log(`- elected: ${apiMatch.elected || 'N/A'}`);
    console.log(`- draw_noresult: ${apiMatch.draw_noresult || 'N/A'}`);
    console.log(`- man_of_match_id: ${apiMatch.man_of_match_id || 'N/A'}`);
    console.log(`- man_of_series_id: ${apiMatch.man_of_series_id || 'N/A'}`);
    console.log(`- total_overs_played: ${apiMatch.total_overs_played || 'N/A'}`);
    console.log(`- super_over: ${apiMatch.super_over || 'N/A'}`);
    console.log(`- follow_on: ${apiMatch.follow_on || 'N/A'}`);
    
    if (apiMatch.league) {
      console.log(`\n- league: ${typeof apiMatch.league === 'object' ? apiMatch.league.name : apiMatch.league}`);
    }
    if (apiMatch.season) {
      console.log(`- season: ${typeof apiMatch.season === 'object' ? apiMatch.season.name : apiMatch.season}`);
    }
    
    console.log(`\n- Has batting data: ${!!apiMatch.batting && Array.isArray(apiMatch.batting) ? apiMatch.batting.length + ' records' : 'No'}`);
    console.log(`- Has bowling data: ${!!apiMatch.bowling && Array.isArray(apiMatch.bowling) ? apiMatch.bowling.length + ' records' : 'No'}`);
    console.log(`- Has scoreboards: ${!!apiMatch.scoreboards && Array.isArray(apiMatch.scoreboards) ? apiMatch.scoreboards.length + ' records' : 'No'}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

inspectApiFields();

