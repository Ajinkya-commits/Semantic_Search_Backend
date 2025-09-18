const mongoose = require('mongoose');
const config = require('../config');

let connection = null;
let isConnected = false;

const connectDB = async () => {
  try {
    if (isConnected) {
      console.log('Database already connected');
      return connection;
    }

    console.log('Connecting to MongoDB...');

    connection = await mongoose.connect(config.database.mongoUri, config.database.options);
    isConnected = true;

    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });

    return connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    isConnected = false;
    throw error;
  }
};

const getConnectionStatus = () => {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
};

module.exports = connectDB;
module.exports.getConnectionStatus = getConnectionStatus;
