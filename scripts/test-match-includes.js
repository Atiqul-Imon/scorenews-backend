/**
 * Test script to check SportsMonks API includes and response structure
 * This will help identify which includes work and what data structure is returned
 */

const axios = require('axios');
require('dotenv').config({ path: '.env' });

const API_TOKEN = process.env.SPORTSMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';

if (!API_TOKEN) {
  console.error('❌ SPORTSMONKS_API_TOKEN not found in .env file');
  process.exit(1);
}

// Test with a live match ID (will be fetched from livescores endpoint)
let TEST_MATCH_ID = null; // Will be set from live matches

async function testInclude(includeParam, description, matchId) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${description}`);
    console.log(`Include: ${includeParam}`);
    console.log(`${'='.repeat(80)}\n`);
    
    const url = `${BASE_URL}/fixtures/${matchId}?api_token=${API_TOKEN}&include=${includeParam}`;
    console.log(`URL: ${url.replace(API_TOKEN, '***')}\n`);
    
    const response = await axios.get(url, {
      timeout: 10000,
    });
    
    if (response.data?.status === 'error') {
      console.log(`❌ API Error: ${JSON.stringify(response.data.message, null, 2)}`);
      return null;
    }
    
    const match = response.data?.data;
    if (!match) {
      console.log('❌ No match data returned');
      return null;
    }
    
    console.log('✅ Request successful!\n');
    
    // Check top-level keys
    console.log('Top-level keys:', Object.keys(match).join(', '));
    
    // Check for batting
    if (match.batting) {
      console.log(`\n✅ Has batting at root: ${Array.isArray(match.batting) ? match.batting.length + ' items' : typeof match.batting}`);
      if (Array.isArray(match.batting) && match.batting.length > 0) {
        const sample = match.batting[0];
        console.log('   Sample batting keys:', Object.keys(sample).join(', '));
        if (sample.batsman) {
          console.log('   ✅ Has batsman nested:', typeof sample.batsman);
          if (typeof sample.batsman === 'object') {
            console.log('   Batsman keys:', Object.keys(sample.batsman).join(', '));
          }
        }
      }
    } else {
      console.log('\n❌ No batting at root level');
    }
    
    // Check for bowling
    if (match.bowling) {
      console.log(`\n✅ Has bowling at root: ${Array.isArray(match.bowling) ? match.bowling.length + ' items' : typeof match.bowling}`);
      if (Array.isArray(match.bowling) && match.bowling.length > 0) {
        const sample = match.bowling[0];
        console.log('   Sample bowling keys:', Object.keys(sample).join(', '));
        if (sample.bowler) {
          console.log('   ✅ Has bowler nested:', typeof sample.bowler);
          if (typeof sample.bowler === 'object') {
            console.log('   Bowler keys:', Object.keys(sample.bowler).join(', '));
          }
        }
      }
    } else {
      console.log('\n❌ No bowling at root level');
    }
    
    // Check scoreboards
    if (match.scoreboards) {
      console.log(`\n✅ Has scoreboards: ${Array.isArray(match.scoreboards) ? match.scoreboards.length + ' items' : typeof match.scoreboards}`);
      if (Array.isArray(match.scoreboards) && match.scoreboards.length > 0) {
        match.scoreboards.forEach((sb, idx) => {
          console.log(`\n   Scoreboard ${idx + 1}:`);
          console.log('   Keys:', Object.keys(sb).join(', '));
          if (sb.batting) {
            console.log(`   ✅ Has batting: ${Array.isArray(sb.batting) ? sb.batting.length + ' items' : typeof sb.batting}`);
            if (Array.isArray(sb.batting) && sb.batting.length > 0) {
              const sample = sb.batting[0];
              console.log('   Sample batting keys:', Object.keys(sample).join(', '));
            }
          }
          if (sb.bowling) {
            console.log(`   ✅ Has bowling: ${Array.isArray(sb.bowling) ? sb.bowling.length + ' items' : typeof sb.bowling}`);
            if (Array.isArray(sb.bowling) && sb.bowling.length > 0) {
              const sample = sb.bowling[0];
              console.log('   Sample bowling keys:', Object.keys(sample).join(', '));
            }
          }
        });
      }
    } else {
      console.log('\n❌ No scoreboards');
    }
    
    // Check for balls (commentary)
    if (match.balls) {
      console.log(`\n✅ Has balls (commentary): ${Array.isArray(match.balls) ? match.balls.length + ' items' : typeof match.balls}`);
      if (Array.isArray(match.balls) && match.balls.length > 0) {
        const sample = match.balls[0];
        console.log('   Sample ball keys:', Object.keys(sample).join(', '));
      }
    } else {
      console.log('\n❌ No balls (commentary)');
    }
    
    return match;
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    return null;
  }
}

async function testLivescoresEndpoint() {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log('Testing /livescores endpoint');
    console.log(`${'='.repeat(80)}\n`);
    
    const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=scoreboards,localteam,visitorteam,venue`;
    console.log(`URL: ${url.replace(API_TOKEN, '***')}\n`);
    
    const response = await axios.get(url, {
      timeout: 10000,
    });
    
    if (response.data?.status === 'error') {
      console.log(`❌ API Error: ${JSON.stringify(response.data.message, null, 2)}`);
      return;
    }
    
    const matches = response.data?.data || [];
    console.log(`✅ Found ${matches.length} live matches\n`);
    
    if (matches.length > 0) {
      const firstMatch = matches[0];
      console.log('Sample match ID:', firstMatch.id);
      console.log('Match keys:', Object.keys(firstMatch).join(', '));
      
      if (firstMatch.scoreboards) {
        console.log(`\n✅ Has scoreboards: ${Array.isArray(firstMatch.scoreboards) ? firstMatch.scoreboards.length + ' items' : typeof firstMatch.scoreboards}`);
        if (Array.isArray(firstMatch.scoreboards) && firstMatch.scoreboards.length > 0) {
          const sb = firstMatch.scoreboards[0];
          console.log('Scoreboard keys:', Object.keys(sb).join(', '));
          if (sb.batting) console.log('✅ Scoreboard has batting');
          if (sb.bowling) console.log('✅ Scoreboard has bowling');
        }
      }
      
      // Use first match ID for detailed testing
      if (firstMatch.id) {
        console.log(`\n📌 Using match ${firstMatch.id} for detailed testing...`);
        return firstMatch.id.toString();
      }
    }
    
    return null;
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    return null;
  }
}

async function main() {
  console.log('🔍 Testing SportsMonks API Includes and Response Structure\n');
  console.log(`Using API Token: ${API_TOKEN.substring(0, 20)}...`);
  console.log(`Base URL: ${BASE_URL}\n`);
  
  // Wait a bit to avoid rate limiting
  console.log('⏳ Waiting 5 seconds to avoid rate limiting...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // First, try to get a live match ID
  const liveMatchId = await testLivescoresEndpoint();
  const matchIdToTest = liveMatchId || TEST_MATCH_ID;
  
  if (!matchIdToTest) {
    console.log('\n❌ No live match found and no test match ID provided.');
    console.log('Please provide a valid live match ID or wait for a live match to start.');
    process.exit(1);
  }
  
  console.log(`\n✅ Using match ID: ${matchIdToTest} for testing\n`);
  
  console.log(`\n\n📋 Testing different include combinations for match ${matchIdToTest}...\n`);
  
  // Test different include combinations
  const testCases = [
    {
      include: 'localteam,visitorteam,scoreboards,venue',
      description: 'Basic includes (scoreboards only)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,venue,league,season',
      description: 'Basic includes with league/season',
    },
    {
      include: 'localteam,visitorteam,scoreboards,batting,venue',
      description: 'Scoreboards + batting (no nesting)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,bowling,venue',
      description: 'Scoreboards + bowling (no nesting)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,batting,bowling,venue',
      description: 'Scoreboards + batting + bowling (no nesting)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,batting.batsman,bowling.bowler,venue',
      description: 'Scoreboards + batting.batsman + bowling.bowler (nested)',
    },
    {
      include: 'localteam,visitorteam,scoreboards.batting,scoreboards.bowling,venue',
      description: 'Scoreboards.batting + scoreboards.bowling (nested in scoreboards)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,venue,balls',
      description: 'Scoreboards + balls (for commentary)',
    },
    {
      include: 'localteam,visitorteam,scoreboards,venue,balls.batsman,balls.bowler',
      description: 'Scoreboards + balls with nested players',
    },
  ];
  
  const results = [];
  
  for (const testCase of testCases) {
    // Add delay to avoid rate limiting (2 seconds between requests)
    console.log(`\n⏳ Waiting 2 seconds before next test...\n`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await testInclude(testCase.include, testCase.description, matchIdToTest);
    results.push({
      description: testCase.description,
      include: testCase.include,
      success: result !== null,
      hasBatting: result && result.batting ? true : false,
      hasBowling: result && result.bowling ? true : false,
      hasScoreboards: result && result.scoreboards ? true : false,
      scoreboardsHaveBatting: result && result.scoreboards && Array.isArray(result.scoreboards) && result.scoreboards.some(sb => sb.batting) || false,
      scoreboardsHaveBowling: result && result.scoreboards && Array.isArray(result.scoreboards) && result.scoreboards.some(sb => sb.bowling) || false,
      hasBalls: result && result.balls ? true : false,
    });
  }
  
  // Summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY');
  console.log(`${'='.repeat(80)}\n`);
  
  console.log('Working includes:');
  results.forEach((r, idx) => {
    if (r.success) {
      console.log(`\n✅ ${r.description}`);
      console.log(`   Include: ${r.include}`);
      console.log(`   - Root batting: ${r.hasBatting ? '✅' : '❌'}`);
      console.log(`   - Root bowling: ${r.hasBowling ? '✅' : '❌'}`);
      console.log(`   - Scoreboards: ${r.hasScoreboards ? '✅' : '❌'}`);
      console.log(`   - Scoreboards.batting: ${r.scoreboardsHaveBatting ? '✅' : '❌'}`);
      console.log(`   - Scoreboards.bowling: ${r.scoreboardsHaveBowling ? '✅' : '❌'}`);
      console.log(`   - Balls (commentary): ${r.hasBalls ? '✅' : '❌'}`);
    } else {
      console.log(`\n❌ ${r.description} - FAILED`);
    }
  });
  
  console.log(`\n\n💡 Recommendation:`);
  const workingIncludes = results.filter(r => r.success);
  if (workingIncludes.length > 0) {
    const bestInclude = workingIncludes.find(r => 
      (r.hasBatting && r.hasBowling) || 
      (r.scoreboardsHaveBatting && r.scoreboardsHaveBowling)
    ) || workingIncludes[0];
    
    console.log(`Use: ${bestInclude.include}`);
    console.log(`This gives you:`);
    if (bestInclude.hasBatting) console.log('  - Batting at root level');
    if (bestInclude.hasBowling) console.log('  - Bowling at root level');
    if (bestInclude.scoreboardsHaveBatting) console.log('  - Batting in scoreboards');
    if (bestInclude.scoreboardsHaveBowling) console.log('  - Bowling in scoreboards');
    if (bestInclude.hasBalls) console.log('  - Commentary (balls)');
  } else {
    console.log('❌ No working includes found. Check API token and subscription.');
  }
}

main().catch(console.error);

