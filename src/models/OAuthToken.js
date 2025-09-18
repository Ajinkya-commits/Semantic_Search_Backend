const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  stackApiKey: {
    type: String,
    required: [true, 'Stack API key is required'],
    unique: true,
    index: true,
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
  lastUsed: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: null });

tokenSchema.methods.updateLastUsed = function() {
  this.lastUsed = new Date();
  return this.save();
};

const OAuthToken = mongoose.model('OAuthToken', tokenSchema);

module.exports = OAuthToken;
