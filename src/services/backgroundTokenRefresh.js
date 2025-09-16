const tokenRefreshService = require('./tokenRefreshService');

class BackgroundTokenRefresh {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.refreshInterval = 5 * 60 * 1000; // 5 minutes
  }

  start() {
    if (this.isRunning) {
      console.log('Background token refresh is already running');
      return;
    }

    console.log('Starting background token refresh service');
    this.isRunning = true;
    
    // Run immediately on start
    this.refreshTokens();
    
    // Then run every 5 minutes
    this.intervalId = setInterval(() => {
      this.refreshTokens();
    }, this.refreshInterval);
  }

  stop() {
    if (!this.isRunning) {
      console.log('Background token refresh is not running');
      return;
    }

    console.log('Stopping background token refresh service');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async refreshTokens() {
    try {
      console.log('Running background token refresh check...');
      const result = await tokenRefreshService.refreshAllExpiredTokens();
      
      if (result.refreshed > 0 || result.failed > 0) {
        console.log('Background token refresh completed', result);
      }
    } catch (error) {
      console.error('Background token refresh failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      refreshInterval: this.refreshInterval,
      nextRefresh: this.intervalId ? new Date(Date.now() + this.refreshInterval).toISOString() : null
    };
  }
}

const backgroundTokenRefresh = new BackgroundTokenRefresh();

module.exports = backgroundTokenRefresh;
