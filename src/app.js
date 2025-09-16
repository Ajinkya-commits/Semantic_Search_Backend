require('express-async-errors');
require('dotenv').config();

const express = require('express');

const config = require('./config');
const databaseConnection = require('./database/connection');
const backgroundTokenRefresh = require('./services/backgroundTokenRefresh');

const { errorHandler, notFound } = require('./shared/middleware/errorHandler');

// Feature-based routes
const searchRoutes = require('./features/search/routes/searchRoutes');
const indexRoutes = require('./features/indexing/routes/indexRoutes');
const authRoutes = require('./features/auth/routes/authRoutes');
const configRoutes = require('./features/config/routes/configRoutes');

// Legacy routes (to be migrated)
const syncRoutes = require('./routes/syncRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const oauthCallbackRouter = require('./routes/oauthCallback');
const webhookRouter = require('./routes/webhookRoutes');

class Application {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Basic CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: config.server.env,
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        features: {
          search: true,
          indexing: true,
          auth: true,
          config: true
        }
      });
    });

    // Feature-based API routes
    this.app.use('/api/search', searchRoutes);
    this.app.use('/api/index', indexRoutes);
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/config', configRoutes);
    
    // Legacy routes (to be migrated)
    this.app.use('/api/sync', syncRoutes);
    this.app.use('/api/tokens', tokenRoutes);
    
    // OAuth and webhook routes
    this.app.use('/', oauthCallbackRouter);
    this.app.use('/', webhookRouter);
  }

  setupErrorHandling() {
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  async start() {
    try {
      await databaseConnection.connect();
      
      backgroundTokenRefresh.start();
      console.log('Background token refresh service started');
      
      this.app.listen(config.server.port, config.server.host, () => {
        console.log(`Server running on http://${config.server.host}:${config.server.port}`);
        console.log(`Health Check: http://${config.server.host}:${config.server.port}/health`);
        console.log('Using modular feature-based architecture');
      });

      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));
      
    } catch (error) {
      console.error('Failed to start application', error.message);
      process.exit(1);
    }
  }

  async gracefulShutdown(signal) {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await databaseConnection.gracefulShutdown();
      
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown', error.message);
      process.exit(1);
    }
  }
}

const application = new Application();
application.start();

module.exports = application;
