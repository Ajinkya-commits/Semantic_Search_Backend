const mongoose = require('mongoose');

const fieldConfigSchema = new mongoose.Schema({
  stackApiKey: {
    type: String,
    required: true,
    index: true
  },
  contentType: {
    type: String,
    required: true
  },
  fieldUid: {
    type: String,
    required: true
  },
  includeInEmbedding: {
    type: Boolean,
    default: true
  },
  weight: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient queries
fieldConfigSchema.index({ stackApiKey: 1, contentType: 1, fieldUid: 1 }, { unique: true });

// Update the updatedAt field before saving
fieldConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find configs by stack
fieldConfigSchema.statics.findByStack = function(stackApiKey) {
  return this.find({ stackApiKey });
};

// Static method to find configs by stack and content type
fieldConfigSchema.statics.findByStackAndContentType = function(stackApiKey, contentType) {
  return this.find({ stackApiKey, contentType });
};

const FieldConfig = mongoose.model('FieldConfig', fieldConfigSchema);

module.exports = FieldConfig;
