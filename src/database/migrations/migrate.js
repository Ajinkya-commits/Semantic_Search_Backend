const mongoose = require('mongoose');
const config = require('../../config');

const OAuthToken = require('../../models/OAuthToken');
const SearchLog = require('../../models/SearchLog');

class DatabaseMigration {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await mongoose.connect(config.database.mongoUri, config.database.options);
      console.log('Connected to database for migration');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.connection.close();
      console.log('Disconnected from database');
    }
  }

  async createIndexes() {
    try {
      console.log('Creating database indexes...');

      // OAuthToken indexes
      await OAuthToken.collection.createIndex({ stackApiKey: 1, isActive: 1 });
      await OAuthToken.collection.createIndex({ expiresAt: 1 });
      await OAuthToken.collection.createIndex({ createdAt: 1 });

      // SearchLog indexes
      await SearchLog.collection.createIndex({ createdAt: -1 });
      await SearchLog.collection.createIndex({ stackApiKey: 1, createdAt: -1 });
      await SearchLog.collection.createIndex({ success: 1, createdAt: -1 });
      await SearchLog.collection.createIndex({ environment: 1, createdAt: -1 });

      // TTL index for SearchLog (30 days)
      await SearchLog.collection.createIndex(
        { createdAt: 1 }, 
        { expireAfterSeconds: 30 * 24 * 60 * 60 }
      );

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Failed to create indexes:', error);
      throw error;
    }
  }

  async cleanupExpiredTokens() {
    try {
      console.log('Cleaning up expired tokens...');
      
      const result = await OAuthToken.deactivateExpiredTokens();
      
      if (result.modifiedCount > 0) {
        console.log(`Deactivated ${result.modifiedCount} expired tokens`);
      } else {
        console.log('No expired tokens found');
      }
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error);
      throw error;
    }
  }

  async getDatabaseStats() {
    try {
      const stats = {
        oauthTokens: await OAuthToken.countDocuments(),
        activeTokens: await OAuthToken.countDocuments({ isActive: true }),
        expiredTokens: await OAuthToken.countDocuments({ 
          isActive: true, 
          expiresAt: { $lte: new Date() } 
        }),
        searchLogs: await SearchLog.countDocuments(),
        recentSearches: await SearchLog.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
      };

      console.log('Database statistics:', stats);
      return stats;
    } catch (error) {
      console.error('Failed to get database statistics:', error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      console.log('Starting database migrations...');

      await this.connect();
      await this.createIndexes();
      await this.cleanupExpiredTokens();
      await this.getDatabaseStats();

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  const migration = new DatabaseMigration();
  migration.runMigrations()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseMigration;
