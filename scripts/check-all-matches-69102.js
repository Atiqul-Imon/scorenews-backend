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

async function checkAll() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Checking ALL matches with matchId: ${matchId}\n`);

    // Find ALL matches (no filter on matchId to see if there are variations)
    const allMatches = await CricketMatch.find({})
      .where('matchId').equals(matchId)
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${allMatches.length} match(es) with matchId: ${matchId}\n`);
    console.log('═'.repeat(80));

    allMatches.forEach((match, index) => {
      console.log(`\n📋 Match Entry #${index + 1}:`);
      console.log(`   MongoDB ID: ${match._id}`);
      console.log(`   Match ID: ${match.matchId}`);
      console.log(`   Status: ${match.status || 'N/A'}`);
      console.log(`   Created At: ${match.createdAt ? new Date(match.createdAt).toLocaleString() : 'N/A'}`);
      console.log(`   Updated At: ${match.updatedAt ? new Date(match.updatedAt).toLocaleString() : 'N/A'}`);
      
      if (match.currentScore) {
        console.log(`   Current Score:`);
        console.log(`     Home: ${match.currentScore.home?.runs || 0}/${match.currentScore.home?.wickets || 0} (${match.currentScore.home?.overs || 0} overs)`);
        console.log(`     Away: ${match.currentScore.away?.runs || 0}/${match.currentScore.away?.wickets || 0} (${match.currentScore.away?.overs || 0} overs)`);
      }
      
      if (match.result) {
        console.log(`   Result: ${JSON.stringify(match.result, null, 6)}`);
      } else {
        console.log(`   Result: Not set`);
      }
    });

    console.log('\n' + '═'.repeat(80));

    // Group by status
    const byStatus = {};
    allMatches.forEach(m => {
      const status = m.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    console.log(`\n📊 Matches by Status:`);
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    if (allMatches.length > 1) {
      console.log(`\n⚠️  WARNING: Found ${allMatches.length} duplicate entries!`);
      
      // Find live and completed matches
      const liveMatches = allMatches.filter(m => m.status === 'live');
      const completedMatches = allMatches.filter(m => m.status === 'completed');
      
      if (liveMatches.length > 0 && completedMatches.length > 0) {
        console.log(`\n🔧 Recommendation:`);
        console.log(`   Keep: ${liveMatches.length} live match(es)`);
        console.log(`   Delete: ${completedMatches.length} completed match(es)`);
        console.log(`\n   Run the remove script to clean up duplicates.`);
      }
    } else {
      console.log(`\n✅ No duplicates found`);
    }

    console.log('\n✅ Check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkAll();
















