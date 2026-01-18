const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

async function checkDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('📋 Collections in database:');
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    console.log('');

    // Check news_articles collection
    const newsArticlesCollection = db.collection('news_articles');
    const newsCount = await newsArticlesCollection.countDocuments();
    console.log(`📰 News Articles: ${newsCount} documents`);
    
    if (newsCount > 0) {
      const articles = await newsArticlesCollection.find({}).limit(5).toArray();
      console.log('\n📄 Sample News Articles:');
      articles.forEach((article, index) => {
        console.log(`\n   ${index + 1}. ${article.title || 'No title'}`);
        console.log(`      Slug: ${article.slug || 'No slug'}`);
        console.log(`      Type: ${article.type || 'No type'}`);
        console.log(`      Category: ${article.category || 'No category'}`);
        console.log(`      State: ${article.state || 'No state'}`);
        console.log(`      Published: ${article.publishedAt || 'Not published'}`);
        if (article.summary) {
          console.log(`      Summary: ${article.summary.substring(0, 100)}...`);
        }
      });
    }

    // Check content collection
    const contentCollection = db.collection('content');
    const contentCount = await contentCollection.countDocuments();
    console.log(`\n📝 Content: ${contentCount} documents`);
    
    if (contentCount > 0) {
      const content = await contentCollection.find({}).limit(5).toArray();
      console.log('\n📄 Sample Content:');
      content.forEach((item, index) => {
        console.log(`\n   ${index + 1}. ${item.title || 'No title'}`);
        console.log(`      Type: ${item.type || 'No type'}`);
        console.log(`      Category: ${item.category || 'No category'}`);
        console.log(`      Status: ${item.status || 'No status'}`);
        if (item.content) {
          console.log(`      Content: ${item.content.substring(0, 100)}...`);
        }
      });
    }

    // Check threads collection (for blog-like content)
    const threadsCollection = db.collection('threads');
    const threadsCount = await threadsCollection.countDocuments();
    console.log(`\n💬 Threads: ${threadsCount} documents`);
    
    if (threadsCount > 0) {
      const threads = await threadsCollection.find({}).limit(5).toArray();
      console.log('\n📄 Sample Threads:');
      threads.forEach((thread, index) => {
        console.log(`\n   ${index + 1}. ${thread.title || 'No title'}`);
        console.log(`      Category: ${thread.category || 'No category'}`);
        console.log(`      Views: ${thread.views || 0}`);
        if (thread.content) {
          console.log(`      Content: ${thread.content.substring(0, 100)}...`);
        }
      });
    }

    // Check for any collection with "blog" in the name
    const blogCollections = collections.filter(col => 
      col.name.toLowerCase().includes('blog')
    );
    
    if (blogCollections.length > 0) {
      console.log(`\n📚 Blog-related collections found:`);
      for (const col of blogCollections) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`   - ${col.name}: ${count} documents`);
        if (count > 0) {
          const sample = await db.collection(col.name).find({}).limit(3).toArray();
          sample.forEach((item, index) => {
            console.log(`     ${index + 1}. ${item.title || item.name || 'Untitled'}`);
          });
        }
      }
    } else {
      console.log('\n📚 No blog-specific collections found');
    }

    console.log('\n✅ Database check complete!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkDatabase();

