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

async function checkMatch() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const matchId = '69102';
    console.log(`🔍 Searching for match ID: ${matchId}\n`);

    // Find all matches with this matchId
    const matches = await CricketMatch.find({ matchId: matchId })
      .sort({ createdAt: -1 })
      .lean();

    if (matches.length === 0) {
      console.log(`❌ No matches found with matchId: ${matchId}`);
    } else {
      console.log(`✅ Found ${matches.length} match(es) with matchId: ${matchId}\n`);
      console.log('═'.repeat(80));

      matches.forEach((match, index) => {
        console.log(`\n📋 Match Entry #${index + 1}:`);
        console.log(`   MongoDB ID: ${match._id}`);
        console.log(`   Match ID: ${match.matchId}`);
        console.log(`   Status: ${match.status || 'N/A'}`);
        console.log(`   Series: ${match.series || 'N/A'}`);
        console.log(`   Format: ${match.format || 'N/A'}`);
        console.log(`   Match Type: ${match.matchType || 'N/A'}`);
        
        if (match.teams) {
          console.log(`   Teams:`);
          if (match.teams.home) {
            console.log(`     Home: ${match.teams.home.name || 'N/A'} (${match.teams.home.shortName || 'N/A'})`);
            if (match.teams.home.score) {
              console.log(`       Score: ${match.teams.home.score.runs || 0}/${match.teams.home.score.wickets || 0} (${match.teams.home.score.overs || 0} overs)`);
            }
          }
          if (match.teams.away) {
            console.log(`     Away: ${match.teams.away.name || 'N/A'} (${match.teams.away.shortName || 'N/A'})`);
            if (match.teams.away.score) {
              console.log(`       Score: ${match.teams.away.score.runs || 0}/${match.teams.away.score.wickets || 0} (${match.teams.away.score.overs || 0} overs)`);
            }
          }
        }

        if (match.currentScore) {
          console.log(`   Current Score:`);
          console.log(`     ${JSON.stringify(match.currentScore, null, 6)}`);
        }

        console.log(`   Start Time: ${match.startTime ? new Date(match.startTime).toLocaleString() : 'N/A'}`);
        console.log(`   End Time: ${match.endTime ? new Date(match.endTime).toLocaleString() : 'N/A'}`);
        console.log(`   Created At: ${match.createdAt ? new Date(match.createdAt).toLocaleString() : 'N/A'}`);
        console.log(`   Updated At: ${match.updatedAt ? new Date(match.updatedAt).toLocaleString() : 'N/A'}`);
      });

      console.log('\n' + '═'.repeat(80));

      // Check for duplicates
      if (matches.length > 1) {
        console.log(`\n⚠️  WARNING: Found ${matches.length} duplicate entries for match ${matchId}`);
        console.log(`   This is causing the issue. You should keep only the live match and delete completed duplicates.`);
      }

      // Check status
      const liveMatches = matches.filter(m => m.status === 'live');
      const completedMatches = matches.filter(m => m.status === 'completed');
      const upcomingMatches = matches.filter(m => m.status === 'upcoming');

      console.log(`\n📊 Status Breakdown:`);
      console.log(`   Live: ${liveMatches.length}`);
      console.log(`   Completed: ${completedMatches.length}`);
      console.log(`   Upcoming: ${upcomingMatches.length}`);
    }

    console.log('\n✅ Match check complete!');
    
  } catch (error) {
    console.error('❌ Error checking match:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkMatch();




