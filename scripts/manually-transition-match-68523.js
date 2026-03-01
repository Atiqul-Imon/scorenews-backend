/**
 * Manually transition match 68523 from live to completed
 * This match has ended but is stuck in live collection
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const MATCH_ID = '68523';

async function manuallyTransitionMatch() {
  try {
    console.log('🔧 Manually Transitioning Match 68523 to Completed\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in .env');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // 1. Get the live match
    const liveMatch = await db.collection('cricket_live_matches').findOne({ matchId: MATCH_ID });
    
    if (!liveMatch) {
      console.log('❌ Match not found in live_matches collection');
      console.log('Checking completed_matches...');
      const completedMatch = await db.collection('cricket_completed_matches').findOne({ matchId: MATCH_ID });
      if (completedMatch) {
        console.log('✅ Match is already in completed_matches collection');
        console.log('Status:', completedMatch.status);
      }
      process.exit(0);
    }
    
    console.log('✅ Found match in live_matches collection\n');
    console.log('Current State:');
    console.log('  Status:', liveMatch.status);
    console.log('  Home Score:', liveMatch.currentScore?.home?.runs, '/', liveMatch.currentScore?.home?.wickets, '(', liveMatch.currentScore?.home?.overs, 'ov)');
    console.log('  Away Score:', liveMatch.currentScore?.away?.runs, '/', liveMatch.currentScore?.away?.wickets, '(', liveMatch.currentScore?.away?.overs, 'ov)');
    
    // 2. Determine result
    const homeRuns = liveMatch.currentScore?.home?.runs || 0;
    const awayRuns = liveMatch.currentScore?.away?.runs || 0;
    const homeWickets = liveMatch.currentScore?.home?.wickets || 0;
    const awayWickets = liveMatch.currentScore?.away?.wickets || 0;
    
    let winner = null;
    let winnerName = null;
    let margin = 0;
    let marginType = 'runs';
    let resultText = '';
    
    if (homeRuns > awayRuns) {
      winner = 'home';
      winnerName = liveMatch.teams?.home?.name || 'Home Team';
      margin = homeRuns - awayRuns;
      resultText = `${winnerName} won by ${margin} runs`;
    } else if (awayRuns > homeRuns) {
      winner = 'away';
      winnerName = liveMatch.teams?.away?.name || 'Away Team';
      margin = awayRuns - homeRuns;
      resultText = `${winnerName} won by ${margin} runs`;
    } else {
      resultText = 'Match tied';
    }
    
    console.log('\n📊 Calculated Result:');
    console.log('  Winner:', winnerName);
    console.log('  Margin:', margin, marginType);
    console.log('  Result Text:', resultText);
    
    // 3. Create completed match document
    const completedMatch = {
      matchId: liveMatch.matchId,
      series: liveMatch.series,
      teams: liveMatch.teams,
      venue: liveMatch.venue,
      status: 'completed',
      format: liveMatch.format,
      startTime: liveMatch.startTime,
      endTime: new Date(), // Set end time to now
      finalScore: {
        home: {
          runs: liveMatch.currentScore?.home?.runs || 0,
          wickets: liveMatch.currentScore?.home?.wickets || 0,
          overs: liveMatch.currentScore?.home?.overs || 0,
        },
        away: {
          runs: liveMatch.currentScore?.away?.runs || 0,
          wickets: liveMatch.currentScore?.away?.wickets || 0,
          overs: liveMatch.currentScore?.away?.overs || 0,
        },
      },
      currentScore: {
        home: {
          runs: liveMatch.currentScore?.home?.runs || 0,
          wickets: liveMatch.currentScore?.home?.wickets || 0,
          overs: liveMatch.currentScore?.home?.overs || 0,
          balls: 0,
        },
        away: {
          runs: liveMatch.currentScore?.away?.runs || 0,
          wickets: liveMatch.currentScore?.away?.wickets || 0,
          overs: liveMatch.currentScore?.away?.overs || 0,
          balls: 0,
        },
      },
      result: {
        winner: winner,
        winnerName: winnerName,
        margin: margin,
        marginType: marginType,
        resultText: resultText,
        dataSource: 'manual',
      },
      batting: liveMatch.batting || [],
      bowling: liveMatch.bowling || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // 4. Use transaction to atomically move the match
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Delete from live_matches
      const deleteResult = await db.collection('cricket_live_matches').deleteOne(
        { matchId: MATCH_ID },
        { session }
      );
      
      if (deleteResult.deletedCount === 0) {
        throw new Error('Failed to delete from live_matches');
      }
      
      console.log('✅ Deleted from live_matches collection');
      
      // Insert into completed_matches
      const insertResult = await db.collection('cricket_completed_matches').insertOne(
        completedMatch,
        { session }
      );
      
      if (!insertResult.insertedId) {
        throw new Error('Failed to insert into completed_matches');
      }
      
      console.log('✅ Inserted into completed_matches collection');
      
      // Commit transaction
      await session.commitTransaction();
      console.log('\n✅ Transaction committed successfully!');
      console.log('\n🎉 Match 68523 has been successfully transitioned to completed');
      console.log('   The website should now show it as COMPLETED instead of LIVE');
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
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

manuallyTransitionMatch();





