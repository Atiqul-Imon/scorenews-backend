/**
 * Script to check MongoDB Atlas for completed cricket matches
 * Run with: npx ts-node scripts/check-completed-matches.ts
 */

import { connect, connection, model, Schema, Document } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
// __dirname is available in CommonJS (ts-node)
dotenv.config({ path: path.join(__dirname, '../.env') });

interface CricketMatch extends Document {
  matchId: string;
  name: string;
  status: string;
  teams: any;
  currentScore: any;
  batting: any[];
  bowling: any[];
  result: any;
  startTime: Date;
  endTime?: Date;
  format: string;
  series: string;
}

const CricketMatchSchema = new Schema({
  matchId: String,
  name: String,
  status: String,
  teams: Object,
  currentScore: Object,
  batting: Array,
  bowling: Array,
  result: Object,
  startTime: Date,
  endTime: Date,
  format: String,
  series: String,
}, { collection: 'cricketmatches', strict: false });

async function checkCompletedMatches() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB Atlas...');
    await connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');

    // List all collections in the database
    const db = connection.db;
    if (db) {
      const collections = await db.listCollections().toArray();
      console.log(`\n📚 Available collections in database: ${collections.length}`);
      if (collections.length > 0) {
        collections.forEach((col: any) => {
          console.log(`   - ${col.name}`);
        });
      }
    }

    // Check both possible collection names
    const CricketMatchModel1 = model<CricketMatch>('CricketMatch', CricketMatchSchema, 'cricketmatches');
    const CricketMatchModel2 = model<CricketMatch>('CricketMatch2', CricketMatchSchema, 'cricket_matches');

    // Find all completed matches from both collections
    const [completedMatches1, completedMatches2] = await Promise.all([
      CricketMatchModel1.find({ status: 'completed' }).sort({ startTime: -1 }).limit(10).lean(),
      CricketMatchModel2.find({ status: 'completed' }).sort({ startTime: -1 }).limit(10).lean(),
    ]);
    
    const completedMatches = [...completedMatches1, ...completedMatches2];

    console.log(`\n📊 Found ${completedMatches.length} completed matches in database\n`);

    if (completedMatches.length === 0) {
      console.log('⚠️  No completed matches found in database');
      console.log('💡 This could mean:');
      console.log('   1. No matches have been completed yet');
      console.log('   2. Matches are not being saved to database');
      console.log('   3. Status field is not set to "completed"');
    } else {
      console.log('📋 Sample completed matches:\n');
      completedMatches.forEach((match, index) => {
        console.log(`${index + 1}. ${match.name || 'Unnamed Match'}`);
        console.log(`   Match ID: ${match.matchId}`);
        console.log(`   Status: ${match.status}`);
        console.log(`   Format: ${match.format || 'Unknown'}`);
        console.log(`   Series: ${match.series || 'Unknown'}`);
        console.log(`   Start Time: ${match.startTime ? new Date(match.startTime).toLocaleString() : 'Unknown'}`);
        console.log(`   End Time: ${match.endTime ? new Date(match.endTime).toLocaleString() : 'Not set'}`);
        
        if (match.currentScore) {
          console.log(`   Score: ${match.currentScore.home?.runs || 0}/${match.currentScore.home?.wickets || 0} vs ${match.currentScore.away?.runs || 0}/${match.currentScore.away?.wickets || 0}`);
        }
        
        if (match.result) {
          console.log(`   Result: ${match.result.resultText || 'N/A'}`);
        }
        
        console.log(`   Has Batting Stats: ${match.batting && match.batting.length > 0 ? `Yes (${match.batting.length} players)` : 'No'}`);
        console.log(`   Has Bowling Stats: ${match.bowling && match.bowling.length > 0 ? `Yes (${match.bowling.length} players)` : 'No'}`);
        console.log('');
      });

      // Get total count from both collections
      const [totalCount1, totalCount2] = await Promise.all([
        CricketMatchModel1.countDocuments({ status: 'completed' }),
        CricketMatchModel2.countDocuments({ status: 'completed' }),
      ]);
      const totalCount = totalCount1 + totalCount2;
      console.log(`\n📈 Total completed matches in database: ${totalCount}`);
      console.log(`   - cricketmatches collection: ${totalCount1}`);
      console.log(`   - cricket_matches collection: ${totalCount2}`);
    }

    // Check for matches with other statuses from both collections
    const [liveMatches1, liveMatches2, upcomingMatches1, upcomingMatches2] = await Promise.all([
      CricketMatchModel1.find({ status: 'live' }).sort({ startTime: -1 }).limit(5).lean(),
      CricketMatchModel2.find({ status: 'live' }).sort({ startTime: -1 }).limit(5).lean(),
      CricketMatchModel1.find({ status: 'upcoming' }).sort({ startTime: -1 }).limit(5).lean(),
      CricketMatchModel2.find({ status: 'upcoming' }).sort({ startTime: -1 }).limit(5).lean(),
    ]);
    
    const liveMatches = [...liveMatches1, ...liveMatches2];
    const upcomingMatches = [...upcomingMatches1, ...upcomingMatches2];
    
    // Get total count of all matches from both collections
    const [totalMatches1, totalMatches2] = await Promise.all([
      CricketMatchModel1.countDocuments({}),
      CricketMatchModel2.countDocuments({}),
    ]);
    const totalMatches = totalMatches1 + totalMatches2;
    
    // Get status distribution from both collections
    const [statusCounts1, statusCounts2] = await Promise.all([
      CricketMatchModel1.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      CricketMatchModel2.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
    ]);
    
    // Merge status counts
    const statusCountsMap = new Map<string, number>();
    [...statusCounts1, ...statusCounts2].forEach((stat: any) => {
      const key = stat._id || 'null';
      statusCountsMap.set(key, (statusCountsMap.get(key) || 0) + stat.count);
    });
    const statusCounts = Array.from(statusCountsMap.entries()).map(([id, count]) => ({ _id: id, count }));

    console.log(`\n📊 Database Statistics:`);
    console.log(`   Total matches in database: ${totalMatches}`);
    console.log(`   - cricketmatches collection: ${totalMatches1} matches`);
    console.log(`   - cricket_matches collection: ${totalMatches2} matches`);
    
    if (statusCounts.length > 0) {
      console.log(`\n   Status distribution:`);
      statusCounts.forEach((stat: any) => {
        console.log(`     - ${stat._id || 'null'}: ${stat.count} matches`);
      });
    }

    if (liveMatches.length > 0) {
      console.log(`\n⚠️  Found ${liveMatches.length} matches with status "live"`);
      console.log('   Sample live matches:');
      liveMatches.slice(0, 3).forEach((match: any) => {
        console.log(`     - ${match.name || 'Unnamed'} (ID: ${match.matchId})`);
        if (match.currentScore) {
          const home = match.currentScore.home || {};
          const away = match.currentScore.away || {};
          console.log(`       Score: ${home.runs || 0}/${home.wickets || 0} vs ${away.runs || 0}/${away.wickets || 0}`);
        }
      });
      console.log('   These might need to be checked if they are actually completed\n');
    }
    
    if (upcomingMatches.length > 0) {
      console.log(`\n📅 Found ${upcomingMatches.length} upcoming matches`);
    }

    await connection.close();
    console.log('✅ Connection closed');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await connection.close();
    process.exit(1);
  }
}

// Run the script
checkCompletedMatches();

