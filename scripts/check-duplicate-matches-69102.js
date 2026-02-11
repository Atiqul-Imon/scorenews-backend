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

async function checkDuplicates() {
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
      console.log(`\n⚠️  WARNING: Found ${matches.length} duplicate entries!`);
      console.log(`   This is causing the issue. You should keep only one match entry.`);
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

checkDuplicates();
























