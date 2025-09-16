require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 8000,
    env: process.env.NODE_ENV || 'development',
    host: process.env.HOST || 'localhost',
  },

  // Database Configuration
  database: {
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/contentstack-semantic-search',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // External API Configuration
  apis: {
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
      baseUrl: 'https://api.cohere.com/v1',
      models: {
        embedding: 'embed-v4.0',
        rerank: 'rerank-multilingual-v3.0',
        multimodal: 'embed-multimodal-v1.0',
      },
    },
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY,
      indexName: process.env.PINECONE_INDEX_NAME,
      environment: process.env.PINECONE_ENVIRONMENT,
    },
    contentstack: {
      baseUrl: 'https://eu-api.contentstack.com/v3',
      clientId: process.env.CONTENTSTACK_CLIENT_ID,
      clientSecret: process.env.CONTENTSTACK_CLIENT_SECRET,
      redirectUri: process.env.CONTENTSTACK_REDIRECT_URI,
      appUid: process.env.CONTENTSTACK_APP_UID,
    },
  },

  // Search Configuration
  search: {
    defaultTopK: 10,
    maxTopK: 50,
    defaultRerankTopK: 20,
    similarityThreshold: 0.7,
    batchSize: 100,
  },

  // Cache Configuration
  cache: {
    ttl: 300, // 5 minutes
    maxSize: 1000,
  },

  // Validation Configuration
  validation: {
    maxQueryLength: 500,
    maxFiltersCount: 10,
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'COHERE_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX_NAME',
  'MONGO_URI',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Log optional environment variables that are missing
const optionalEnvVars = [
  'CONTENTSTACK_WEBHOOK_SECRET',
  'CONTENTSTACK_CLIENT_ID',
  'CONTENTSTACK_CLIENT_SECRET',
  'CONTENTSTACK_REDIRECT_URI',
  'CONTENTSTACK_APP_UID',
];


module.exports = config;
