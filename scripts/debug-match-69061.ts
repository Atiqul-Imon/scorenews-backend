import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { transformSportsMonksMatchToFrontend } from '../src/modules/cricket/utils/match-transformers';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPORTMONKS_API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function debugMatch() {
  if (!SPORTMONKS_API_TOKEN) {
    console.error('❌ SPORTMONKS_API_TOKEN not found');
    process.exit(1);
  }

  console.log('🔍 Debugging Match 69061 (Ireland vs UAE)...\n');

  try {
    // Get the match from livescores
    const response = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: SPORTMONKS_API_TOKEN,
        include: 'scoreboards,localteam,visitorteam,batting.batsman,bowling.bowler',
      },
    });

    const matches = response.data?.data || [];
    const match = matches.find((m: any) => m.id === 69061 || 
      (m.localteam?.name?.toLowerCase().includes('uae') && m.visitorteam?.name?.toLowerCase().includes('ireland')));

    if (!match) {
      console.log('❌ Match not found in livescores endpoint');
      process.exit(1);
    }

    console.log('📦 Raw API Match Data:');
    console.log(JSON.stringify(match, null, 2));
    console.log('\n');

    // Transform the match
    console.log('🔄 Transforming match...\n');
    const transformed = transformSportsMonksMatchToFrontend(match, 'cricket');

    console.log('✅ Transformed Match:');
    console.log(JSON.stringify(transformed, null, 2));
    console.log('\n');

    // Check filtering logic
    console.log('🔍 Filtering Check:');
    console.log(`  Status: ${transformed.status}`);
    console.log(`  Match Started: ${transformed.matchStarted}`);
    console.log(`  Match Ended: ${transformed.matchEnded}`);
    console.log(`  Start Time: ${transformed.startTime}`);
    console.log(`  Current Score: ${JSON.stringify(transformed.currentScore)}`);
    
    const now = new Date();
    const startTime = transformed.startTime ? new Date(transformed.startTime) : null;
    const hasStarted = startTime && startTime <= now;
    const hoursSinceStart = startTime ? (now.getTime() - startTime.getTime()) / (1000 * 60 * 60) : null;
    
    console.log(`  Has Started: ${hasStarted}`);
    console.log(`  Hours Since Start: ${hoursSinceStart?.toFixed(2)}`);
    
    // Check if it would pass the filter
    let wouldPass = false;
    let reason = '';

    if (transformed.status === 'completed' || transformed.matchEnded) {
      reason = 'Match is completed or ended';
    } else if (transformed.status === 'live' || (transformed.matchStarted && !transformed.matchEnded)) {
      wouldPass = true;
      reason = 'Status is live or match started';
    } else if (transformed.startTime && hasStarted && !transformed.matchEnded) {
      if (transformed.currentScore && (transformed.currentScore.home?.runs > 0 || transformed.currentScore.away?.runs > 0)) {
        wouldPass = true;
        reason = 'Match has started with score data';
      } else if (hoursSinceStart !== null && hoursSinceStart <= 8 && hoursSinceStart >= 0) {
        wouldPass = true;
        reason = `Match started ${hoursSinceStart.toFixed(1)} hours ago (within 8 hours)`;
      } else {
        reason = `Match started but outside 8-hour window (${hoursSinceStart?.toFixed(1)} hours ago)`;
      }
    } else {
      reason = 'Match has not started or is in the future';
    }

    console.log(`\n  Would Pass Filter: ${wouldPass ? '✅ YES' : '❌ NO'}`);
    console.log(`  Reason: ${reason}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

debugMatch();

