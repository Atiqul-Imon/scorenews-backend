/**
 * Cleanup MongoDB Atlas Database
 * 
 * This script cleans up all cricket-related collections:
 * - Old collections (cricket_matches)
 * - New collections (cricket_live_matches, cricket_completed_matches)
 * 
 * Usage: node scripts/cleanup-database.js
 * 
 * WARNING: This will delete ALL cricket match data!
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI or DATABASE_URL not found in environment variables');
  console.error('Please set MONGODB_URI in your .env file');
  process.exit(1);
}

// Collections to clean up
const COLLECTIONS_TO_CLEAN = [
  'cricket_matches',              // Old collection
  'cricket_live_matches',         // New live matches collection
  'cricket_completed_matches',    // New completed matches collection
];

async function cleanupDatabase() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    const db = client.db();
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log('📊 Current Collections:');
    collectionNames.forEach(name => {
      const isCricket = COLLECTIONS_TO_CLEAN.includes(name);
      console.log(`  ${isCricket ? '🏏' : '  '} ${name}`);
    });
    console.log('');

    // Find cricket collections that exist
    const existingCricketCollections = COLLECTIONS_TO_CLEAN.filter(name => 
      collectionNames.includes(name)
    );

    if (existingCricketCollections.length === 0) {
      console.log('ℹ️  No cricket collections found. Database is already clean.');
      return;
    }

    console.log('🗑️  Collections to delete:');
    for (const collectionName of existingCricketCollections) {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      console.log(`  - ${collectionName}: ${count} documents`);
    }
    console.log('');

    // Delete collections
    console.log('🧹 Cleaning up collections...\n');
    
    for (const collectionName of existingCricketCollections) {
      try {
        const collection = db.collection(collectionName);
        const result = await collection.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} documents from ${collectionName}`);
      } catch (error) {
        console.error(`❌ Error deleting ${collectionName}:`, error.message);
      }
    }

    // Optionally drop the collections entirely
    console.log('\n🗑️  Dropping collections...');
    for (const collectionName of existingCricketCollections) {
      try {
        await db.collection(collectionName).drop();
        console.log(`✅ Dropped collection: ${collectionName}`);
      } catch (error) {
        if (error.code === 26) {
          console.log(`ℹ️  Collection ${collectionName} already dropped`);
        } else {
          console.error(`❌ Error dropping ${collectionName}:`, error.message);
        }
      }
    }

    console.log('\n✅ Database cleanup completed successfully!');
    console.log('📝 The database is now ready for fresh data from SportsMonks API.');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run cleanup
cleanupDatabase()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Cleanup failed:', error);
    process.exit(1);
  });




