const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema({
  query: {
    type: String,
    required: [true, 'Search query is required'],
    maxlength: [500, 'Query cannot exceed 500 characters'],
  },
  stackApiKey: {
    type: String,
    required: [true, 'Stack API key is required'],
    index: true,
  },
  resultsCount: {
    type: Number,
    required: true,
    min: 0,
  },
  filters: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  responseTime: {
    type: Number,
    required: true,
    min: 0,
  },
  userAgent: {
    type: String,
    maxlength: 500,
  },
  ipAddress: {
    type: String,
    maxlength: 45, // IPv6 max length
  },
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'development',
  },
  success: {
    type: Boolean,
    required: true,
  },
  errorMessage: {
    type: String,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Indexes for analytics and performance
searchLogSchema.index({ createdAt: -1 });
searchLogSchema.index({ stackApiKey: 1, createdAt: -1 });
searchLogSchema.index({ success: 1, createdAt: -1 });
searchLogSchema.index({ environment: 1, createdAt: -1 });

// TTL index to automatically delete old logs (30 days)
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static methods for analytics
searchLogSchema.statics.getSearchStats = function(stackApiKey, startDate, endDate) {
  const matchStage = {
    stackApiKey,
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSearches: { $sum: 1 },
        successfulSearches: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        averageResponseTime: { $avg: '$responseTime' },
        averageResultsCount: { $avg: '$resultsCount' },
      },
    },
  ]);
};

searchLogSchema.statics.getPopularQueries = function(stackApiKey, limit = 10, startDate, endDate) {
  const matchStage = {
    stackApiKey,
    success: true,
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$query',
        count: { $sum: 1 },
        averageResponseTime: { $avg: '$responseTime' },
        averageResultsCount: { $avg: '$resultsCount' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
};

searchLogSchema.statics.getErrorStats = function(stackApiKey, startDate, endDate) {
  const matchStage = {
    stackApiKey,
    success: false,
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$errorMessage',
        count: { $sum: 1 },
        lastOccurrence: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

module.exports = mongoose.model('SearchLog', searchLogSchema);
