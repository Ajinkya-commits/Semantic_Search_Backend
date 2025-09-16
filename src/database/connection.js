const mongoose = require('mongoose');
const config = require('../config');

class DatabaseConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('Database already connected');
        return this.connection;
      }

      console.log('Connecting to MongoDB...', {
        uri: config.database.mongoUri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
      });

      this.connection = await mongoose.connect(config.database.mongoUri, config.database.options);
      this.isConnected = true;

      console.log('✅ MongoDB connected successfully');

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
        this.isConnected = true;
      });

      process.on('SIGINT', this.gracefulShutdown.bind(this));
      process.on('SIGTERM', this.gracefulShutdown.bind(this));

      return this.connection;
    } catch (error) {
      console.error('Failed to connect to MongoDB:', {
        error: error.message,
        uri: config.database.mongoUri.replace(/\/\/.*@/, '//***:***@'),
      });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.isConnected) {
        console.log('Database not connected');
        return;
      }

      await mongoose.disconnect();
      this.isConnected = false;
      console.log('MongoDB disconnected');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  async gracefulShutdown() {
    try {
      console.log('Gracefully shutting down database connection...');
      await this.disconnect();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful database shutdown:', error);
      process.exit(1);
    }
  }

  getConnection() {
    return this.connection;
  }

  isConnectedToDatabase() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };
  }
}

const databaseConnection = new DatabaseConnection();

module.exports = databaseConnection;
