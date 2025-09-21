require("dotenv").config();

const config = {
  server: {
    port: process.env.PORT || 8000,
    env: process.env.NODE_ENV || "development",
    host: process.env.HOST || "localhost",
  },

  database: {
    mongoUri: process.env.MONGO_URI,
  },

  apis: {
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
      baseUrl: "https://api.cohere.ai/v1",
      models: {
        embed: "embed-v4.0",
        rerank: "rerank-v3.5",
      },
    },
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY,
      indexName: process.env.PINECONE_INDEX_NAME,
      environment: process.env.PINECONE_ENVIRONMENT,
    },
    contentstack: {
      baseUrl: "https://eu-api.contentstack.com/v3",
      clientId: process.env.CONTENTSTACK_CLIENT_ID,
      clientSecret: process.env.CONTENTSTACK_CLIENT_SECRET,
      redirectUri: process.env.CONTENTSTACK_REDIRECT_URI,
      appUid: process.env.CONTENTSTACK_APP_UID,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-pro",
    },
  },

  search: {
    defaultTopK: 10,
    maxTopK: 50,
    defaultRerankTopK: 20,
    similarityThreshold: 0.7,
    batchSize: 100,
  },

  cache: {
    ttl: 300,
    maxSize: 1000,
  },

  validation: {
    maxQueryLength: 500,
    maxFiltersCount: 10,
  },
};

const requiredEnvVars = [
  "CONTENTSTACK_CLIENT_ID",
  "CONTENTSTACK_CLIENT_SECRET",
  "CONTENTSTACK_REDIRECT_URI",
  "CONTENTSTACK_APP_UID",
  "COHERE_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "MONGO_URI",
  "GEMINI_API_KEY",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

module.exports = config;
