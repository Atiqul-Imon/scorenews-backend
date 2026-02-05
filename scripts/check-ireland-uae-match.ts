import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPORTMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkIrelandUAEMatch() {
  if (!SPORTMONKS_API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found in environment variables');
    process.exit(1);
  }

  console.log('🔍 Checking SportsMonks API for Ireland vs UAE match...\n');

  try {
    // First, try the livescores endpoint
    console.log('1️⃣ Checking livescores endpoint...');
    try {
      const liveResponse = await axios.get(`${BASE_URL}/livescores`, {
        params: {
          api_token: SPORTMONKS_API_TOKEN,
          include: 'scoreboards,localteam,visitorteam',
        },
      });

      const liveMatches = liveResponse.data?.data || [];
      console.log(`   Found ${liveMatches.length} live matches\n`);

      // Check for Ireland vs UAE
      const irelandUAEMatches = liveMatches.filter((match: any) => {
        const homeTeam = match.localteam?.name?.toLowerCase() || '';
        const awayTeam = match.visitorteam?.name?.toLowerCase() || '';
        const matchName = match.name?.toLowerCase() || '';
        
        const hasIreland = homeTeam.includes('ireland') || awayTeam.includes('ireland') || matchName.includes('ireland');
        const hasUAE = homeTeam.includes('uae') || 
                      awayTeam.includes('uae') || 
                      homeTeam.includes('united arab emirates') || 
                      awayTeam.includes('united arab emirates') ||
                      matchName.includes('uae') ||
                      matchName.includes('united arab emirates');
        
        return hasIreland && hasUAE;
      });

      if (irelandUAEMatches.length > 0) {
        console.log('✅ FOUND LIVE MATCH: Ireland vs UAE\n');
        irelandUAEMatches.forEach((match: any) => {
          console.log('Match Details:');
          console.log(`  ID: ${match.id}`);
          console.log(`  Name: ${match.name || `${match.localteam?.name} vs ${match.visitorteam?.name}`}`);
          console.log(`  State ID: ${match.state_id} (3=live, 4=break, 5=finished)`);
          console.log(`  Home Team: ${match.localteam?.name}`);
          console.log(`  Away Team: ${match.visitorteam?.name}`);
          console.log(`  Starting At: ${match.starting_at}`);
          console.log(`  League: ${match.league?.name || match.season?.name || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('❌ No Ireland vs UAE match found in live matches\n');
      }
    } catch (error: any) {
      console.log(`   ⚠️  Livescores endpoint failed: ${error.response?.status} ${error.response?.statusText}`);
      console.log(`   Error: ${error.response?.data?.message || error.message}\n`);
    }

    // Also check fixtures endpoint as fallback
    console.log('2️⃣ Checking fixtures endpoint (all matches)...');
    try {
      const fixturesResponse = await axios.get(`${BASE_URL}/fixtures`, {
        params: {
          api_token: SPORTMONKS_API_TOKEN,
          include: 'scoreboards,localteam,visitorteam',
          per_page: 250,
        },
      });

      const allMatches = fixturesResponse.data?.data || [];
      console.log(`   Found ${allMatches.length} total matches\n`);

      // Filter for Ireland vs UAE
      const irelandUAEMatches = allMatches.filter((match: any) => {
        const homeTeam = match.localteam?.name?.toLowerCase() || '';
        const awayTeam = match.visitorteam?.name?.toLowerCase() || '';
        const matchName = match.name?.toLowerCase() || '';
        
        const hasIreland = homeTeam.includes('ireland') || awayTeam.includes('ireland') || matchName.includes('ireland');
        const hasUAE = homeTeam.includes('uae') || 
                      awayTeam.includes('uae') || 
                      homeTeam.includes('united arab emirates') || 
                      awayTeam.includes('united arab emirates') ||
                      matchName.includes('uae') ||
                      matchName.includes('united arab emirates');
        
        return hasIreland && hasUAE;
      });

      if (irelandUAEMatches.length > 0) {
        console.log('✅ FOUND MATCHES: Ireland vs UAE\n');
        irelandUAEMatches.forEach((match: any) => {
          const stateId = match.state_id;
          let status = 'Unknown';
          if (stateId === 3) status = 'LIVE';
          else if (stateId === 4) status = 'BREAK/PAUSED';
          else if (stateId === 5) status = 'FINISHED';
          else if (stateId === 6) status = 'ABANDONED';
          else if (stateId === 1) status = 'NOT STARTED';
          else if (stateId === 2) status = 'DELAYED';

          console.log('Match Details:');
          console.log(`  ID: ${match.id}`);
          console.log(`  Name: ${match.name || `${match.localteam?.name} vs ${match.visitorteam?.name}`}`);
          console.log(`  Status: ${status} (State ID: ${stateId})`);
          console.log(`  Home Team: ${match.localteam?.name} (ID: ${match.localteam_id})`);
          console.log(`  Away Team: ${match.visitorteam?.name} (ID: ${match.visitorteam_id})`);
          console.log(`  Starting At: ${match.starting_at}`);
          console.log(`  League: ${match.league?.name || match.season?.name || 'N/A'}`);
          
          // Check if it's live
          if (stateId === 3 || stateId === 4) {
            console.log(`  ⚠️  This match is LIVE but may not be showing on website!`);
          }
          console.log('');
        });
      } else {
        console.log('❌ No Ireland vs UAE match found in fixtures\n');
      }

      // Also show all live matches for debugging
      const liveMatches = allMatches.filter((match: any) => match.state_id === 3 || match.state_id === 4);
      if (liveMatches.length > 0) {
        console.log(`\n📊 Found ${liveMatches.length} live matches (state_id 3 or 4):`);
        liveMatches.slice(0, 10).forEach((match: any) => {
          console.log(`  - ${match.localteam?.name || 'Team1'} vs ${match.visitorteam?.name || 'Team2'} (ID: ${match.id}, State: ${match.state_id})`);
        });
        if (liveMatches.length > 10) {
          console.log(`  ... and ${liveMatches.length - 10} more`);
        }
      }
    } catch (error: any) {
      console.log(`   ⚠️  Fixtures endpoint failed: ${error.response?.status} ${error.response?.statusText}`);
      console.log(`   Error: ${error.response?.data?.message || error.message}\n`);
    }

    // Check what the backend API returns
    console.log('\n3️⃣ Checking backend API response...');
    try {
      const backendResponse = await axios.get('http://localhost:5000/api/v1/cricket/matches/live', {
        params: { t: Date.now() },
      });
      
      const backendMatches = Array.isArray(backendResponse.data) 
        ? backendResponse.data 
        : (backendResponse.data?.data || []);
      
      console.log(`   Backend returned ${backendMatches.length} live matches\n`);
      
      const irelandUAEMatches = backendMatches.filter((match: any) => {
        const homeTeam = match.teams?.home?.name?.toLowerCase() || '';
        const awayTeam = match.teams?.away?.name?.toLowerCase() || '';
        const matchName = match.name?.toLowerCase() || '';
        
        const hasIreland = homeTeam.includes('ireland') || awayTeam.includes('ireland') || matchName.includes('ireland');
        const hasUAE = homeTeam.includes('uae') || 
                      awayTeam.includes('uae') || 
                      homeTeam.includes('united arab emirates') || 
                      awayTeam.includes('united arab emirates') ||
                      matchName.includes('uae') ||
                      matchName.includes('united arab emirates');
        
        return hasIreland && hasUAE;
      });

      if (irelandUAEMatches.length > 0) {
        console.log('✅ Backend API has Ireland vs UAE match:');
        irelandUAEMatches.forEach((match: any) => {
          console.log(`  - ${match.name || `${match.teams?.home?.name} vs ${match.teams?.away?.name}`}`);
          console.log(`    Status: ${match.status}`);
          console.log(`    Match ID: ${match.matchId}`);
        });
      } else {
        console.log('❌ Backend API does not have Ireland vs UAE match');
        console.log('\n   Possible reasons:');
        console.log('   1. Match is filtered out by status check');
        console.log('   2. Match transformation failed');
        console.log('   3. Match is excluded by innings completion check');
      }
    } catch (error: any) {
      console.log(`   ⚠️  Backend API check failed: ${error.message}`);
      console.log('   Make sure backend is running on http://localhost:5000');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

checkIrelandUAEMatch();



















