import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testLiveMatchesAPI() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  console.log('🔍 Testing Live Matches API...\n');
  
  try {
    const response = await axios.get(`${base}/api/v1/cricket/matches/live`, {
      params: { t: Date.now() },
    });
    
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    const matches = Array.isArray(response.data) 
      ? response.data 
      : (response.data?.data || []);
    
    console.log(`\n✅ Found ${matches.length} live matches\n`);
    
    if (matches.length > 0) {
      matches.forEach((match: any, index: number) => {
        console.log(`Match ${index + 1}:`);
        console.log(`  ID: ${match.matchId}`);
        console.log(`  Name: ${match.name}`);
        console.log(`  Status: ${match.status}`);
        console.log(`  Format: ${match.format}`);
        console.log(`  Teams: ${match.teams?.home?.name} vs ${match.teams?.away?.name}`);
        console.log(`  Score: ${match.currentScore?.home?.runs || 0}/${match.currentScore?.home?.wickets || 0} vs ${match.currentScore?.away?.runs || 0}/${match.currentScore?.away?.wickets || 0}`);
        console.log('');
      });
    } else {
      console.log('❌ No live matches returned!');
      console.log('\nPossible issues:');
      console.log('1. Matches are being filtered out');
      console.log('2. Transformation is failing');
      console.log('3. API is not returning matches');
      console.log('\nCheck backend logs for details.');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testLiveMatchesAPI();

