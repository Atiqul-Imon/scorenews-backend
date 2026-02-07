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
  result: Object,
  currentScore: Object,
}, { collection: 'cricket_matches' });

const CricketMatch = mongoose.model('CricketMatch', cricketMatchSchema);

async function checkResult() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Checking result field for match ID: ${matchId}\n`);

    const match = await CricketMatch.findOne({ matchId: matchId }).lean();

    if (!match) {
      console.log(`❌ Match not found`);
      process.exit(1);
    }

    console.log(`📋 Match Status: ${match.status}`);
    console.log(`📋 Has Result Field: ${!!match.result}`);
    
    if (match.result) {
      console.log(`\n📄 Result Object:`);
      console.log(JSON.stringify(match.result, null, 2));
    } else {
      console.log(`\n✅ No result field found (this is correct for live matches)`);
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

checkResult();
















