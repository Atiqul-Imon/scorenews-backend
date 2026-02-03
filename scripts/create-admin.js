const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Get name, email and password from command line arguments
const name = process.argv[2];
const email = process.argv[3];
const password = process.argv[4];

if (!name || !email || !password) {
  console.error('❌ Usage: node create-admin.js <name> <email> <password>');
  console.error('   Example: node create-admin.js "Admin User" admin@scorenews.net Admin123!');
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ Password must be at least 6 characters long');
  process.exit(1);
}

// Email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ Invalid email format');
  process.exit(1);
}

// Define User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
  preferences: {
    type: {
      favoriteTeams: [String],
      favoriteSports: [String],
      notifications: {
        email: Boolean,
        push: Boolean,
        matchUpdates: Boolean,
        contentUpdates: Boolean,
      },
    },
    default: {},
  },
  stats: {
    type: {
      contentSubmitted: Number,
      contentApproved: Number,
      totalViews: Number,
      totalLikes: Number,
    },
    default: {},
  },
}, { collection: 'users', timestamps: true });

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

async function createAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error(`❌ User with email "${email}" already exists`);
      console.log(`   Current role: ${existingUser.role}`);
      console.log(`   Name: ${existingUser.name}`);
      console.log('\n💡 Tip: Use reset-admin-password.js to reset password for existing user');
      process.exit(1);
    }

    // Create new admin user
    const newUser = new User({
      name: name,
      email: email.toLowerCase(),
      password: password, // Will be hashed by pre-save hook
      role: 'admin',
      isVerified: true, // Set to true so admin can login immediately
      preferences: {
        favoriteTeams: [],
        favoriteSports: [],
        notifications: {
          email: true,
          push: true,
          matchUpdates: true,
          contentUpdates: true,
        },
      },
      stats: {
        contentSubmitted: 0,
        contentApproved: 0,
        totalViews: 0,
        totalLikes: 0,
      },
    });

    await newUser.save();

    console.log('✅ Admin user created successfully!');
    console.log('\n📧 Admin Credentials:');
    console.log(`   Name: ${newUser.name}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`   Verified: ${newUser.isVerified ? 'Yes' : 'No'}`);
    console.log('\n🌐 Login URL:');
    console.log(`   https://scorenews.net/login`);
    console.log('\n⚠️  Please change this password after logging in for security.');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate email - user already exists');
    }
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

createAdmin();




