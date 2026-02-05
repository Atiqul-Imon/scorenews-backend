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
  series: String,
  matchType: String,
  teams: Object,
  venue: Object,
  status: String,
  format: String,
  startTime: Date,
  endTime: Date,
  currentScore: Object,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'cricket_matches' });

const CricketMatch = mongoose.model('CricketMatch', cricketMatchSchema);

async function fixMatchStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Fixing match ID: ${matchId}\n`);

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
    console.log(`   End Time: ${match.endTime ? new Date(match.endTime).toLocaleString() : 'Not set'}\n`);

    // Check if match should be live
    const awayOvers = match.currentScore?.away?.overs || 0;
    const awayWickets = match.currentScore?.away?.wickets || 0;
    const matchFormat = (match.format || '').toLowerCase();
    const isT20 = matchFormat.includes('t20');
    const maxOvers = isT20 ? 20 : 50;

    // If England has only faced a few overs, match is definitely still live
    if (awayOvers < maxOvers && awayWickets < 10) {
      console.log(`✅ Match should be LIVE (England has only faced ${awayOvers} overs, max is ${maxOvers})`);
      
      // Update status to live
      match.status = 'live';
      match.endTime = null; // Remove end time
      match.matchEnded = false;
      await match.save();

      console.log(`\n✅ Match status updated to 'live'`);
      console.log(`   Removed end time`);
      console.log(`   Match will now appear in live matches\n`);
    } else {
      console.log(`⚠️  Match appears to be actually completed based on scorecard`);
      console.log(`   England overs: ${awayOvers}/${maxOvers}`);
      console.log(`   England wickets: ${awayWickets}/10`);
    }

    console.log('✅ Match fix complete!');
    
  } catch (error) {
    console.error('❌ Error fixing match:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixMatchStatus();












