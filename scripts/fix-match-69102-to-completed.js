require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

async function fixMatchStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Match = mongoose.model('CricketMatch', new mongoose.Schema({}, { collection: 'cricket_matches', strict: false }));
    const match = await Match.findOne({ matchId: '69102' });

    if (!match) {
      console.error('❌ Match 69102 not found in database');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 Current Match Status:');
    console.log(`   Status: ${match.status}`);
    console.log(`   Match Ended: ${match.matchEnded}`);
    console.log(`   Result: ${match.result ? JSON.stringify(match.result).substring(0, 100) : 'N/A'}`);
    console.log(`   Teams: ${match.teams?.home?.name} vs ${match.teams?.away?.name}\n`);

    // Determine winner from teams
    const isEnglandHome = match.teams?.home?.name?.toLowerCase().includes('england') || match.teams?.home?.id === 'england';
    const isEnglandAway = match.teams?.away?.name?.toLowerCase().includes('england') || match.teams?.away?.id === 'england';
    
    // Create result object
    const result = {
      winner: isEnglandAway ? 'away' : 'home',
      winnerName: 'England',
      margin: 11,
      marginType: 'runs',
      resultText: 'England won by 11 runs (DLS method)',
      dataSource: 'api',
    };

    // Use updateOne to ensure update persists
    const updateResult = await Match.updateOne(
      { matchId: '69102' },
      {
        $set: {
          status: 'completed',
          matchEnded: true,
          endTime: match.endTime || new Date(),
          result: result,
        },
        $unset: {
          // Remove any fields that shouldn't be there for completed matches
        }
      }
    );

    console.log(`   Update result: ${updateResult.modifiedCount} document(s) modified`);

    console.log('✅ Match updated successfully!\n');
    console.log('📋 Updated Match Status:');
    console.log(`   Status: ${match.status}`);
    console.log(`   Match Ended: ${match.matchEnded}`);
    console.log(`   Result: ${match.result ? JSON.stringify(match.result).substring(0, 100) : 'N/A'}`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error fixing match status:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
  }
}

fixMatchStatus();

