/**
 * Database migration script
 * This script helps migrate from the old structure to the new one
 */

const mongoose = require('mongoose');
const config = require('../../config');
const logger = require('../../config/logger');

// Import models
const OAuthToken = require('../../models/OAuthToken');
const SearchLog = require('../../models/SearchLog');

class DatabaseMigration {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await mongoose.connect(config.database.mongoUri, config.database.options);
      logger.info('Connected to database for migration');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.connection.close();
      logger.info('Disconnected from database');
    }
  }

  /**
   * Create indexes for better performance
   */
  async createIndexes() {
    try {
      logger.info('Creating database indexes...');

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

      logger.info('✅ Database indexes created successfully');
    } catch (error) {
      logger.error('Failed to create indexes:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens() {
    try {
      logger.info('Cleaning up expired tokens...');
      
      const result = await OAuthToken.deactivateExpiredTokens();
      
      if (result.modifiedCount > 0) {
        logger.info(`✅ Deactivated ${result.modifiedCount} expired tokens`);
      } else {
        logger.info('No expired tokens found');
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
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

      logger.info('Database statistics:', stats);
      return stats;
    } catch (error) {
      logger.error('Failed to get database statistics:', error);
      throw error;
    }
  }

  /**
   * Run all migrations
   */
  async runMigrations() {
    try {
      logger.info('Starting database migrations...');

      await this.connect();
      await this.createIndexes();
      await this.cleanupExpiredTokens();
      await this.getDatabaseStats();

      logger.info('✅ All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed:', error);
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
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseMigration;
