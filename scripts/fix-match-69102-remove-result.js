const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define CricketMatch Schema
const cricketMatchSchema = new mongoose.Schema({}, { collection: 'cricket_matches', strict: false });

const CricketMatch = mongoose.model('CricketMatch', cricketMatchSchema);

async function fixMatch() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Fixing match ID: ${matchId}\n`);

    // Find all matches with this matchId
    const matches = await CricketMatch.find({ matchId: matchId });

    if (matches.length === 0) {
      console.log(`❌ Match not found`);
      process.exit(1);
    }

    console.log(`✅ Found ${matches.length} match(es)\n`);

    for (const match of matches) {
      console.log(`📋 Processing match: ${match._id}`);
      console.log(`   Current Status: ${match.status}`);
      console.log(`   Has Result: ${!!match.result}`);
      
      if (match.currentScore) {
        const awayOvers = match.currentScore.away?.overs || 0;
        const awayWickets = match.currentScore.away?.wickets || 0;
        const matchFormat = (match.format || '').toLowerCase();
        const isT20 = matchFormat.includes('t20');
        const maxOvers = isT20 ? 20 : 50;
        
        console.log(`   England: ${match.currentScore.away?.runs || 0}/${awayWickets} (${awayOvers} overs)`);
        console.log(`   Max Overs: ${maxOvers}`);
        
        // Check if match should be live
        if (awayOvers < maxOvers && awayWickets < 10) {
          console.log(`   ✅ Match should be LIVE (England has only faced ${awayOvers} overs, max is ${maxOvers})`);
          
          // Update to live and remove result
          match.status = 'live';
          match.matchEnded = false;
          match.result = undefined;
          match.endTime = undefined;
          
          await match.save();
          
          console.log(`   ✅ Updated to LIVE status and removed result\n`);
        } else {
          console.log(`   ⚠️  Match appears to be actually completed\n`);
        }
      }
    }

    console.log('✅ Fix complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixMatch();




