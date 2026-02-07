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

async function removeDuplicate() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Checking for duplicate matches with matchId: ${matchId}\n`);

    const matches = await CricketMatch.find({ matchId: matchId })
      .sort({ createdAt: -1 })
      .lean();

    if (matches.length === 0) {
      console.log(`❌ No matches found`);
      process.exit(1);
    }

    console.log(`✅ Found ${matches.length} match(es)\n`);
    console.log('═'.repeat(80));

    matches.forEach((match, index) => {
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

    if (matches.length > 1) {
      console.log(`\n⚠️  Found ${matches.length} duplicate entries!`);
      
      // Find the live match (should keep this one)
      const liveMatch = matches.find(m => m.status === 'live');
      const completedMatch = matches.find(m => m.status === 'completed');
      
      if (liveMatch && completedMatch) {
        console.log(`\n🔧 Removing completed match (keeping live match)...`);
        console.log(`   Keeping: ${liveMatch._id} (status: ${liveMatch.status})`);
        console.log(`   Deleting: ${completedMatch._id} (status: ${completedMatch.status})`);
        
        const result = await CricketMatch.deleteOne({ _id: completedMatch._id });
        
        if (result.deletedCount > 0) {
          console.log(`\n✅ Successfully deleted completed match`);
          console.log(`   Remaining matches: ${matches.length - 1}`);
        } else {
          console.log(`\n❌ Failed to delete match`);
        }
      } else if (completedMatch && !liveMatch) {
        // If only completed match exists, check if it should be live
        console.log(`\n⚠️  Only completed match found. Checking if it should be live...`);
        const currentScore = completedMatch.currentScore;
        if (currentScore && currentScore.away) {
          const awayOvers = currentScore.away.overs || 0;
          const awayWickets = currentScore.away.wickets || 0;
          const matchFormat = (completedMatch.format || '').toLowerCase();
          const isT20 = matchFormat.includes('t20');
          const maxOvers = isT20 ? 20 : 50;
          
          if (awayOvers < maxOvers && awayWickets < 10) {
            console.log(`   Match should be LIVE - updating status...`);
            await CricketMatch.updateOne(
              { _id: completedMatch._id },
              {
                $set: { status: 'live', matchEnded: false },
                $unset: { result: '', endTime: '' }
              }
            );
            console.log(`   ✅ Updated to live status`);
          }
        }
      } else {
        console.log(`\n⚠️  Multiple matches found but unclear which to delete.`);
        console.log(`   Please review manually.`);
      }
    } else {
      console.log(`\n✅ No duplicates found - only one match entry exists`);
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

removeDuplicate();















