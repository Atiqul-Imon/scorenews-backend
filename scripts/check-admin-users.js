const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define User Schema (simplified for querying)
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
  createdAt: Date,
  lastLogin: Date,
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function checkAdminUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Query for admin users
    console.log('🔍 Searching for admin users...\n');
    const adminUsers = await User.find({ role: 'admin' })
      .select('name email role isVerified createdAt lastLogin')
      .lean();

    if (adminUsers.length === 0) {
      console.log('❌ No admin users found in the database.\n');
      console.log('💡 You may need to create an admin user manually or through the registration process.');
    } else {
      console.log(`✅ Found ${adminUsers.length} admin user(s):\n`);
      console.log('═'.repeat(80));
      
      adminUsers.forEach((user, index) => {
        console.log(`\n👤 Admin User #${index + 1}:`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   Role: ${user.role || 'N/A'}`);
        console.log(`   Verified: ${user.isVerified ? '✅ Yes' : '❌ No'}`);
        console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}`);
        console.log(`   Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}`);
        console.log(`\n   📧 Login Credentials:`);
        console.log(`      Email: ${user.email || 'N/A'}`);
        console.log(`      Password: [Hashed - Cannot be retrieved]`);
        console.log(`      ⚠️  Note: Password is hashed. You'll need to reset it if you don't know it.`);
      });
      
      console.log('\n' + '═'.repeat(80));
    }

    // Also check for moderator users
    const moderatorUsers = await User.find({ role: 'moderator' })
      .select('name email role isVerified createdAt lastLogin')
      .lean();

    if (moderatorUsers.length > 0) {
      console.log(`\n📋 Found ${moderatorUsers.length} moderator user(s) (can also access admin panel):\n`);
      moderatorUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name || 'N/A'} (${user.email || 'N/A'}) - ${user.isVerified ? 'Verified' : 'Not Verified'}`);
      });
    }

    // Check total user count
    const totalUsers = await User.countDocuments();
    console.log(`\n📊 Total users in database: ${totalUsers}`);
    console.log(`   - Admin: ${adminUsers.length}`);
    console.log(`   - Moderator: ${moderatorUsers.length}`);
    console.log(`   - Other: ${totalUsers - adminUsers.length - moderatorUsers.length}`);

    console.log('\n✅ Admin user check complete!');
    
  } catch (error) {
    console.error('❌ Error checking admin users:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkAdminUsers();





















