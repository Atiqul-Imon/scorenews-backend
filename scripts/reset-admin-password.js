const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Get email and new password from command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('❌ Usage: node reset-admin-password.js <email> <new-password>');
  console.error('   Example: node reset-admin-password.js admin@onescore.com MyNewPassword123');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('❌ Password must be at least 6 characters long');
  process.exit(1);
}

// Define User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
}, { collection: 'users' });

// Add pre-save hook to hash password
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

const User = mongoose.model('User', userSchema);

async function resetAdminPassword() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User with email "${email}" not found`);
      process.exit(1);
    }

    if (user.role !== 'admin') {
      console.warn(`⚠️  Warning: User "${email}" is not an admin (role: ${user.role})`);
      console.log('   Proceeding anyway...\n');
    }

    console.log(`👤 Found user: ${user.name} (${user.email})`);
    console.log(`   Current role: ${user.role}`);
    console.log(`   Verified: ${user.isVerified ? 'Yes' : 'No'}\n`);

    // Set new password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    console.log('✅ Password reset successfully!');
    console.log('\n📧 Login Credentials:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\n⚠️  Please change this password after logging in for security.');
    
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

resetAdminPassword();















