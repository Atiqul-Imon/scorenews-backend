/**
 * Delete match 68523 (England vs West Indies) from database
 * This match has incorrect data and should be removed
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const MATCH_ID = '68523';

async function deleteMatch() {
  try {
    console.log('🗑️  Deleting Match 68523 (England vs West Indies) from Database\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in .env');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Check if match exists in live_matches
    const liveMatch = await db.collection('cricket_live_matches').findOne({ matchId: MATCH_ID });
    if (liveMatch) {
      console.log('Found match in cricket_live_matches collection');
      const deleteLiveResult = await db.collection('cricket_live_matches').deleteOne({ matchId: MATCH_ID });
      if (deleteLiveResult.deletedCount > 0) {
        console.log('✅ Deleted from cricket_live_matches collection');
      }
    } else {
      console.log('Match not found in cricket_live_matches collection');
    }
    
    // Check if match exists in completed_matches
    const completedMatch = await db.collection('cricket_completed_matches').findOne({ matchId: MATCH_ID });
    if (completedMatch) {
      console.log('Found match in cricket_completed_matches collection');
      const deleteCompletedResult = await db.collection('cricket_completed_matches').deleteOne({ matchId: MATCH_ID });
      if (deleteCompletedResult.deletedCount > 0) {
        console.log('✅ Deleted from cricket_completed_matches collection');
      }
    } else {
      console.log('Match not found in cricket_completed_matches collection');
    }
    
    // Verify deletion
    const verifyLive = await db.collection('cricket_live_matches').findOne({ matchId: MATCH_ID });
    const verifyCompleted = await db.collection('cricket_completed_matches').findOne({ matchId: MATCH_ID });
    
    if (!verifyLive && !verifyCompleted) {
      console.log('\n✅ Match 68523 has been successfully deleted from all collections');
      console.log('   The website should no longer show this match');
    } else {
      console.log('\n⚠️  Warning: Match may still exist in database');
      if (verifyLive) console.log('   Still exists in cricket_live_matches');
      if (verifyCompleted) console.log('   Still exists in cricket_completed_matches');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  }
}

deleteMatch();





