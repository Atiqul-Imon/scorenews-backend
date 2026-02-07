const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define CricketMatch Schema
const cricketMatchSchema = new mongoose.Schema({
  matchId: String,
  status: String,
  format: String,
  currentScore: Object,
  endTime: Date,
  matchEnded: Boolean,
}, { collection: 'cricket_matches' });

const CricketMatch = mongoose.model('CricketMatch', cricketMatchSchema);

async function forceMatchLive() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Force fixing match ID: ${matchId}\n`);

    // Find the match
    const match = await CricketMatch.findOne({ matchId: matchId });

    if (!match) {
      console.log(`❌ Match not found with matchId: ${matchId}`);
      process.exit(1);
    }

    console.log(`📋 Current Match Status:`);
    console.log(`   Status: ${match.status}`);
    console.log(`   Sri Lanka: ${match.currentScore?.home?.runs || 0}/${match.currentScore?.home?.wickets || 0} (${match.currentScore?.home?.overs || 0} overs)`);
    console.log(`   England: ${match.currentScore?.away?.runs || 0}/${match.currentScore?.away?.wickets || 0} (${match.currentScore?.away?.overs || 0} overs)`);
    console.log(`   Format: ${match.format || 'N/A'}\n`);

    // Force update to live
    const awayOvers = match.currentScore?.away?.overs || 0;
    const awayWickets = match.currentScore?.away?.wickets || 0;
    const matchFormat = (match.format || '').toLowerCase();
    const isT20 = matchFormat.includes('t20');
    const maxOvers = isT20 ? 20 : 50;

    console.log(`🔧 Force updating match to LIVE status...`);
    console.log(`   England overs: ${awayOvers}/${maxOvers}`);
    console.log(`   England wickets: ${awayWickets}/10`);
    console.log(`   Match is clearly still in progress\n`);

    // Force update
    await CricketMatch.updateOne(
      { matchId: matchId },
      {
        $set: {
          status: 'live',
          matchEnded: false,
        },
        $unset: {
          endTime: '',
        }
      }
    );

    console.log(`✅ Match status FORCE updated to 'live'`);
    console.log(`   Removed end time`);
    console.log(`   Set matchEnded to false`);
    console.log(`   Match will now appear in live matches\n`);

    // Verify
    const updatedMatch = await CricketMatch.findOne({ matchId: matchId });
    console.log(`✅ Verification:`);
    console.log(`   Status: ${updatedMatch.status}`);
    console.log(`   Match Ended: ${updatedMatch.matchEnded || false}`);
    console.log(`   End Time: ${updatedMatch.endTime || 'Not set'}`);

    console.log('\n✅ Match fix complete!');
    
  } catch (error) {
    console.error('❌ Error fixing match:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

forceMatchLive();
















