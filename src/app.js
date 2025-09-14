require('express-async-errors');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./config/logger');
const databaseConnection = require('./database/connection');
const backgroundTokenRefresh = require('./services/backgroundTokenRefresh');

const { errorHandler, notFound } = require('./shared/middleware/errorHandler');
const { 
  securityHeaders, 
  developmentRateLimit, 
  corsOptions, 
  sanitizeRequest, 
  requestLogger 
} = require('./shared/middleware/security');

// Feature-based routes
const searchRoutes = require('./features/search/routes/searchRoutes');
const indexRoutes = require('./features/indexing/routes/indexRoutes');
const authRoutes = require('./features/auth/routes/authRoutes');
const configRoutes = require('./features/config/routes/configRoutes');

// Legacy routes (to be migrated)
const syncRoutes = require('./routes/syncRoutes');
const fieldConfigRoutes = require('./routes/fieldConfigRoutes');
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
    this.app.use(securityHeaders);
    this.app.use(cors(corsOptions));
    this.app.use(compression());
    
    this.app.use(requestLogger);
    this.app.use(morgan('combined', { stream: logger.stream }));
    
    this.app.use(developmentRateLimit);
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    this.app.use(sanitizeRequest);
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
    this.app.use('/api/field-config', fieldConfigRoutes);
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
      logger.info(' Background token refresh service started');
      
      this.app.listen(config.server.port, config.server.host, () => {
        logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
        logger.info(`Health Check: http://${config.server.host}:${config.server.port}/health`);
        logger.info('Using modular feature-based architecture');
      });

      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));
      
    } catch (error) {
      logger.error('Failed to start application', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  }

  async gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await databaseConnection.gracefulShutdown();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error.message,
      });
      process.exit(1);
    }
  }
}

const application = new Application();
application.start();

module.exports = application;
