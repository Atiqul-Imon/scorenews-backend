import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
  scorerProfile: Object,
}, { collection: 'users' });

async function checkUserScorerProfile() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', UserSchema);
    const email = 'rahat2003ahmed@gmail.com';

    console.log(`🔍 Checking user: ${email}\n`);
    
    const user = await User.findOne({ email: email.toLowerCase() }).lean();

    if (!user) {
      console.error(`❌ User with email "${email}" not found.`);
      process.exit(1);
    }

    console.log('📋 User Details:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Is Verified: ${user.isVerified}\n`);

    console.log('📋 Scorer Profile:');
    if (!user.scorerProfile) {
      console.error('   ❌ scorerProfile does not exist!');
      console.log('\n💡 Solution: User needs to register as a scorer first.');
    } else {
      console.log(`   isScorer: ${user.scorerProfile.isScorer}`);
      console.log(`   scorerId: ${user.scorerProfile.scorerId || 'NOT SET'}`);
      console.log(`   scorerType: ${user.scorerProfile.scorerType || 'NOT SET'}`);
      console.log(`   verificationStatus: ${user.scorerProfile.verificationStatus || 'NOT SET'}`);
      console.log(`   location: ${JSON.stringify(user.scorerProfile.location || {})}`);
      
      if (!user.scorerProfile.isScorer) {
        console.error('\n   ❌ isScorer is false!');
      }
      if (!user.scorerProfile.scorerId) {
        console.error('\n   ❌ scorerId is missing!');
      }
    }

    // Check for local matches created by this user
    const LocalMatchSchema = new mongoose.Schema({}, { collection: 'local_cricket_matches', strict: false });
    const LocalMatch = mongoose.model('LocalMatch', LocalMatchSchema);
    
    if (user.scorerProfile?.scorerId) {
      console.log(`\n🔍 Checking for matches created by scorerId: ${user.scorerProfile.scorerId}`);
      const matches = await LocalMatch.find({ 'scorerInfo.scorerId': user.scorerProfile.scorerId }).lean();
      console.log(`   Found ${matches.length} matches`);
      
      if (matches.length > 0) {
        console.log('\n📋 Matches:');
        matches.forEach((match: any, index: number) => {
          console.log(`   ${index + 1}. ${match.matchId} - ${match.series}`);
          console.log(`      Status: ${match.status}`);
          console.log(`      Teams: ${match.teams?.home?.name} vs ${match.teams?.away?.name}`);
          console.log(`      Created: ${match.createdAt}`);
        });
      } else {
        console.log('   ⚠️  No matches found for this scorer');
      }
    }

    // Check all local matches
    console.log(`\n🔍 Checking all local matches in database...`);
    const allMatches = await LocalMatch.find({}).lean();
    console.log(`   Total local matches in database: ${allMatches.length}`);
    
    if (allMatches.length > 0) {
      console.log('\n📋 All Local Matches:');
      allMatches.forEach((match: any, index: number) => {
        console.log(`   ${index + 1}. ${match.matchId} - ${match.series}`);
        console.log(`      Scorer: ${match.scorerInfo?.scorerName} (${match.scorerInfo?.scorerId})`);
        console.log(`      Status: ${match.status}`);
        console.log(`      Created: ${match.createdAt}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkUserScorerProfile();

