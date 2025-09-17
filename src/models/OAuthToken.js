const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  stackApiKey: {
    type: String,
    required: [true, 'Stack API key is required'],
    unique: true,
    index: true,
  },
  organizationUid: {
    type: String,
    required: [true, 'Organization UID is required'],
  },
  accessToken: {
    type: String,
    required: [true, 'Access token is required'],
  },
  refreshToken: {
    type: String,
    required: [true, 'Refresh token is required'],
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUsed: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Indexes for better performance
tokenSchema.index({ stackApiKey: 1, isActive: 1 });
tokenSchema.index({ expiresAt: 1 }); // Regular index for querying, no auto-deletion

// Pre-save middleware
tokenSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
tokenSchema.methods.isExpired = function() {
  return new Date() >= this.expiresAt;
};

tokenSchema.methods.updateLastUsed = function() {
  this.lastUsed = new Date();
  return this.save();
};

// Static methods
tokenSchema.statics.findActiveByStackApiKey = function(stackApiKey) {
  return this.findOne({ 
    stackApiKey, 
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

tokenSchema.statics.findActiveTokens = function() {
  return this.find({ 
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

tokenSchema.statics.deactivateExpiredTokens = async function() {
  try {
    const result = await this.updateMany(
      { 
        expiresAt: { $lte: new Date() },
        isActive: true 
      },
      { isActive: false }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Deactivated ${result.modifiedCount} expired tokens`);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to deactivate expired tokens', {
      error: error.message,
    });
    throw error;
  }
};

tokenSchema.statics.cleanupOldTokens = async function() {
  try {
    // Delete tokens that have been inactive for more than 30 days
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    const result = await this.deleteMany({
      isActive: false,
      updatedAt: { $lt: thirtyDaysAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} old inactive tokens`);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to cleanup old tokens', {
      error: error.message,
    });
    throw error;
  }
};

tokenSchema.statics.findTokensNeedingRefresh = function() {
  // Find tokens that are expired or will expire within 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + (5 * 60 * 1000));
  return this.find({
    isActive: true,
    expiresAt: { $lte: fiveMinutesFromNow },
  });
};

// Error handling middleware
tokenSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    next(new Error('Stack API key already exists'));
  } else {
    next(error);
  }
});

module.exports = mongoose.model('OAuthToken', tokenSchema);
