const tokenRefreshService = require('./tokenRefreshService');
const logger = require('../config/logger');

class BackgroundTokenRefresh {
  constructor() {
    this.refreshInterval = null;
    this.isRunning = false;
    this.refreshIntervalMs = 5 * 60 * 1000; 
  }


  start() {
    if (this.isRunning) {
      logger.warn('Background token refresh is already running');
      return;
    }

    logger.info('Starting background token refresh service', {
      intervalMs: this.refreshIntervalMs,
    });

    this.isRunning = true;
    
    // Run immediately on start
    this.refreshTokens();

    // Set up interval
    this.refreshInterval = setInterval(() => {
      this.refreshTokens();
    }, this.refreshIntervalMs);
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Background token refresh is not running');
      return;
    }

    logger.info('Stopping background token refresh service');

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.isRunning = false;
  }

  async refreshTokens() {
    try {
      logger.debug('Running background token refresh...');
      
      const results = await tokenRefreshService.refreshAllExpiredTokens();
      
      if (results.total > 0) {
        logger.info('Background token refresh completed', {
          total: results.total,
          refreshed: results.refreshed,
          failed: results.failed,
          errors: results.errors,
        });
      } else {
        logger.debug('No tokens needed refreshing');
      }
    } catch (error) {
      logger.error('Background token refresh failed', {
        error: error.message,
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      refreshIntervalMs: this.refreshIntervalMs,
      nextRefresh: this.refreshInterval ? 
        new Date(Date.now() + this.refreshIntervalMs) : null,
    };
  }
}

const backgroundTokenRefresh = new BackgroundTokenRefresh();

module.exports = backgroundTokenRefresh;


