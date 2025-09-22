# Contentstack Semantic Search Backend

A Node.js backend service that provides semantic search capabilities for Contentstack CMS using vector embeddings and AI-powered search algorithms.

## Overview

This backend service integrates with Contentstack CMS to enable intelligent content discovery through semantic search. It processes content from Contentstack, generates embeddings using Cohere AI, stores vectors in Pinecone, and provides search APIs for the frontend application.

## Architecture

The backend follows a modular architecture with feature-based organization:

```
src/
├── features/
│   ├── search/         # Search controllers and routes
│   ├── indexing/       # Content indexing logic
│   ├── auth/           # OAuth authentication
│   └── config/         # Configuration management
├── services/           # External API integrations
├── models/             # MongoDB schemas
├── middleware/         # Request processing
└── app.js              # Server entry point
```

## Technology Stack

- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **MongoDB** - Document database with Mongoose ODM
- **Cohere AI** - Text embedding generation
- **Pinecone** - Vector database for similarity search
- **Joi** - Request validation and schema validation

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp src/env.example src/.env
```

3. Set up your environment variables in `.env`:
```
CONTENTSTACK_API_KEY=your_contentstack_api_key
CONTENTSTACK_DELIVERY_TOKEN=your_delivery_token
CONTENTSTACK_ENVIRONMENT=development
COHERE_API_KEY=your_cohere_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
MONGODB_URI=mongodb://localhost:27017/contentstack-search
PORT=8000
```

4. Start the development server:
```bash
npm run dev
```

## Development Challenges and Solutions

### Multi-Stack Isolation Issue

Initially faced a critical problem where multiple Contentstack stacks were seeing each other's data. This happened because the OAuth token system wasn't properly isolating data between different stack installations.

**Problem**: When Stack A and Stack B were both installed, Stack B could see Stack A's content types and search results.

**Root Cause**: The OAuthToken model had a unique constraint on stackApiKey, and the authentication middleware was automatically falling back to the first available token when no specific stack was requested.

**Solution**: 
- Removed the unique constraint from OAuthToken model to allow multiple tokens per stack
- Enhanced the authentication middleware to require explicit stackApiKey when multiple stacks exist
- Implemented stack-specific Pinecone indexes using the pattern `semantic-search-${stackApiKey}`

```javascript
// Enhanced authentication middleware
const authenticateStack = async (req, res, next) => {
  const stackApiKey = req.query.stackApiKey || req.body.stackApiKey;
  if (!stackApiKey) {
    return res.status(400).json({ error: 'stackApiKey is required' });
  }
  // Validate and set stack context
};
```

### OAuth Token Refresh Problems

Encountered an issue where OAuth tokens were being automatically deleted after 1 hour instead of being refreshed, causing authentication failures during search operations.

**Problem**: Users would get "No entry data returned" errors after tokens expired.

**Root Cause**: MongoDB TTL (Time To Live) index was automatically deleting expired tokens before the refresh service could process them.

**Solution**: 
- Removed the TTL index from the OAuthToken model
- Implemented manual token lifecycle management with `isActive` field
- Enhanced the token refresh service to handle expired tokens within a 24-hour window

```javascript
// Fixed token refresh logic
const refreshAllExpiredTokens = async () => {
  const expiredTokens = await OAuthToken.find({
    expiresAt: { $lt: new Date() },
    isActive: true
  });
  
  for (const token of expiredTokens) {
    await refreshTokenIfNeeded(token);
  }
};
```

### Search Result Enrichment Failures

Some search results were failing during Contentstack data enrichment with generic "API request failed" errors.

**Problem**: Entries with `_img_0` suffixes were causing enrichment failures.

**Analysis**: These entries appeared to be asset references rather than regular content entries, so the standard entry API endpoints weren't working.

**Solution**: Added robust error handling and fallback logic to include results even when enrichment fails.

```javascript
const enrichResultsWithContentstackData = async (results, stackApiKey) => {
  const enrichedResults = [];
  
  for (const result of results) {
    try {
      const entryData = await contentstackService.fetchEntryByUid(
        result.metadata.contentType,
        result.metadata.entryUid,
        stackApiKey
      );
      enrichedResults.push({ ...result, entryData });
    } catch (error) {
      console.warn(`Failed to enrich entry ${result.metadata.entryUid}:`, error.message);
      enrichedResults.push(result);
    }
  }
  
  return enrichedResults;
};
```

### Image Embedding Model Issues

Initially tried using Cohere's multimodal embedding model for image processing but ran into several limitations.

**Problems with Cohere**:
- Limited image format support
- Inconsistent embedding quality for visual content
- API rate limiting issues
- High latency for image processing

**Solution**: Decided to implement a separate Python service using Facebook's DINOv2 model, which provided better image understanding and faster local processing.

## API Endpoints

### Search APIs
- `GET /api/search/text` - Text-based semantic search
- `POST /api/search/image` - Image-based search
- `POST /api/search/hybrid` - Combined text and image search
- `GET /api/search/analytics` - Search analytics data

### Indexing APIs
- `POST /api/index/reindex` - Trigger content reindexing
- `GET /api/index/status` - Get indexing progress
- `GET /api/index/stats` - Index statistics

### Configuration APIs
- `GET /api/config/stack` - Get stack configuration
- `GET /api/config/content-types` - Get available content types
- `POST /api/config/fields` - Configure searchable fields

### Authentication APIs
- `GET /api/auth/authorize` - Initiate OAuth flow
- `POST /api/auth/callback` - Handle OAuth callback
- `POST /api/auth/refresh` - Refresh access token

## Performance Optimizations

### Caching Strategy
Implemented LRU caching for frequently accessed embeddings to reduce API calls to Cohere.

### Batch Processing
Added efficient batch processing for content indexing to handle large content volumes.

### Connection Pooling
Configured MongoDB connection pooling for better database performance.

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## Code Quality

Lint the codebase:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

## Deployment

The service is designed to run on Node.js 18+ and can be deployed to any cloud platform that supports Node.js applications.

For production deployment:
1. Set NODE_ENV=production
2. Configure production database URLs
3. Set up proper logging and monitoring
4. Configure CORS for your frontend domain

## Contributing

1. Create a feature branch from main
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
