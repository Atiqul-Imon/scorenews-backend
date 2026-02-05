import axios from 'axios';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';

async function testLocalMatchCreation() {
  try {
    console.log('🔍 Testing Local Match Creation...\n');
    console.log(`API Base URL: ${API_BASE_URL}\n`);

    // Step 1: Login as scorer
    console.log('1️⃣ Logging in as scorer (rahat2003ahmed@gmail.com)...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
      emailOrPhone: 'rahat2003ahmed@gmail.com',
      password: 'your_password_here', // User needs to provide actual password
    });

    if (!loginResponse.data.success) {
      console.error('❌ Login failed:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Check user profile
    console.log('2️⃣ Checking user profile...');
    const profileResponse = await axios.get(`${API_BASE_URL}/api/v1/scorer/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('User Profile:', JSON.stringify(profileResponse.data, null, 2));
    
    if (!profileResponse.data.data?.scorerProfile?.isScorer) {
      console.error('❌ User is not a registered scorer!');
      return;
    }

    console.log('✅ User is a registered scorer');
    console.log(`   Scorer ID: ${profileResponse.data.data.scorerProfile.scorerId}`);
    console.log(`   Scorer Type: ${profileResponse.data.data.scorerProfile.scorerType}\n`);

    // Step 3: Create a test match
    console.log('3️⃣ Creating test match...');
    const matchData = {
      series: 'Test Local League 2026',
      format: 't20',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      venue: {
        name: 'Test Cricket Ground',
        city: 'Dhaka',
        address: 'Test Address',
      },
      teams: {
        home: 'Test Team A',
        away: 'Test Team B',
      },
      location: {
        country: 'Bangladesh',
        city: 'Dhaka',
        district: 'Dhaka',
        area: 'Test Area',
      },
    };

    const createResponse = await axios.post(
      `${API_BASE_URL}/api/v1/cricket/local/matches`,
      matchData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Match creation response:', JSON.stringify(createResponse.data, null, 2));
    const matchId = createResponse.data.data?.matchId;
    
    if (matchId) {
      console.log(`\n✅ Match created successfully!`);
      console.log(`   Match ID: ${matchId}`);
      
      // Step 4: Verify match in database
      console.log('\n4️⃣ Verifying match exists...');
      const getMatchResponse = await axios.get(
        `${API_BASE_URL}/api/v1/cricket/local/matches/${matchId}`
      );
      
      console.log('Match details:', JSON.stringify(getMatchResponse.data, null, 2));
      
      // Step 5: Check if match appears in list
      console.log('\n5️⃣ Checking match list...');
      const listResponse = await axios.get(
        `${API_BASE_URL}/api/v1/cricket/local/matches?status=upcoming&limit=10`
      );
      
      const matches = listResponse.data.data || [];
      const foundMatch = matches.find((m: any) => m.matchId === matchId);
      
      if (foundMatch) {
        console.log('✅ Match found in list!');
      } else {
        console.log('❌ Match NOT found in list');
        console.log(`   Total matches in list: ${matches.length}`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ Error occurred:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    console.error('\nStack:', error.stack);
  }
}

// Run the test
testLocalMatchCreation();







