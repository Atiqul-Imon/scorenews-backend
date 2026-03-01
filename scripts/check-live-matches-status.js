/**
 * Check live matches status - database and API
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: '.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cricinfo';
const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

async function checkLiveMatchesStatus() {
  console.log('🔍 Checking Live Matches Status\n');
  
  // 1. Check database
  console.log('='.repeat(80));
  console.log('1. DATABASE CHECK');
  console.log('='.repeat(80));
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const liveMatchesCollection = db.collection('cricket_live_matches');
    
    const dbMatches = await liveMatchesCollection.find({}).toArray();
    console.log(`Found ${dbMatches.length} live matches in database`);
    
    if (dbMatches.length > 0) {
      console.log('\nSample matches:');
      dbMatches.slice(0, 3).forEach((match, idx) => {
        console.log(`\n${idx + 1}. Match ID: ${match.matchId}`);
        console.log(`   Teams: ${match.homeTeam?.name || 'N/A'} vs ${match.awayTeam?.name || 'N/A'}`);
        console.log(`   Status: ${match.status}`);
        console.log(`   Start Time: ${match.startTime}`);
        console.log(`   Updated At: ${match.updatedAt || 'N/A'}`);
      });
    } else {
      console.log('❌ No live matches in database');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
  
  // 2. Check SportsMonk API
  console.log('\n\n' + '='.repeat(80));
  console.log('2. SPORTSMONK API CHECK');
  console.log('='.repeat(80));
  
  if (!API_TOKEN) {
    console.log('❌ SPORTSMONKS_API_TOKEN not found');
    return;
  }
  
  try {
    console.log('⏳ Waiting 30 seconds to avoid rate limiting...\n');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const livescoresUrl = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`;
    console.log('Fetching from:', livescoresUrl.replace(API_TOKEN, '***'));
    
    const response = await axios.get(livescoresUrl, { timeout: 15000 });
    
    if (response.data?.status === 'error') {
      console.log('❌ API Error:', JSON.stringify(response.data.message, null, 2));
    } else {
      const matches = response.data?.data || [];
      console.log(`✅ API returned ${matches.length} live matches\n`);
      
      if (matches.length > 0) {
        console.log('Sample matches from API:');
        matches.slice(0, 3).forEach((match, idx) => {
          console.log(`\n${idx + 1}. Match ID: ${match.id}`);
          console.log(`   Name: ${match.name || 'N/A'}`);
          console.log(`   Status: ${match.status}`);
          console.log(`   Live: ${match.live}`);
          console.log(`   State ID: ${match.state_id}`);
          console.log(`   Note: ${match.note || 'N/A'}`);
          if (match.localteam) {
            console.log(`   Home: ${match.localteam.name}`);
          }
          if (match.visitorteam) {
            console.log(`   Away: ${match.visitorteam.name}`);
          }
        });
      } else {
        console.log('❌ No live matches from API');
      }
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  // 3. Check backend API endpoint
  console.log('\n\n' + '='.repeat(80));
  console.log('3. BACKEND API ENDPOINT CHECK');
  console.log('='.repeat(80));
  
  try {
    const backendUrl = 'http://localhost:5000/api/v1/cricket/matches/live';
    console.log('Fetching from:', backendUrl);
    
    const response = await axios.get(backendUrl, { timeout: 10000 });
    
    if (response.data?.success) {
      const matches = response.data?.data || [];
      console.log(`✅ Backend returned ${matches.length} live matches\n`);
      
      if (matches.length > 0) {
        console.log('Sample matches from backend:');
        matches.slice(0, 3).forEach((match, idx) => {
          console.log(`\n${idx + 1}. Match ID: ${match.matchId}`);
          console.log(`   Teams: ${match.homeTeam?.name || 'N/A'} vs ${match.awayTeam?.name || 'N/A'}`);
          console.log(`   Status: ${match.status}`);
        });
      } else {
        console.log('❌ Backend returned empty array');
      }
    } else {
      console.log('❌ Backend returned error:', response.data);
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ Error: ${error.message}`);
      console.log('   (Backend might not be running)');
    }
  }
}

checkLiveMatchesStatus().catch(console.error);




