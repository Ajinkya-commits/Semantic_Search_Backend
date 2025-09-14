const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../shared/middleware/errorHandler');

class RerankerService {
  constructor() {
    this.apiKey = config.apis.cohere.apiKey;
    this.baseUrl = config.apis.cohere.baseUrl;
    this.model = config.apis.cohere.models.rerank;
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Rerank search results using Cohere's rerank API
   * @param {string} query - Original search query
   * @param {Array} results - Array of search results to rerank
   * @param {number} topK - Number of top results to return after reranking
   * @returns {Array} Reranked results with rerank scores
   */
  async rerankResults(query, results, topK = 10) {
    if (!query || typeof query !== 'string') {
      throw new AppError('Query must be a non-empty string', 400);
    }

    if (!Array.isArray(results) || results.length === 0) {
      logger.warn('No results to rerank');
      return [];
    }

    if (topK < 1 || topK > 100) {
      throw new AppError('topK must be between 1 and 100', 400);
    }

    // Limit the number of results to rerank (API has limits)
    const maxRerankResults = 100;
    const resultsToRerank = results.slice(0, maxRerankResults);

    try {
      logger.debug('Reranking results', {
        queryLength: query.length,
        resultsCount: resultsToRerank.length,
        topK,
      });

      const documents = resultsToRerank.map(result => result.text || '');

      const response = await axios.post(
        `${this.baseUrl}/rerank`,
        {
          model: this.model,
          query,
          documents,
          top_k: Math.min(topK, resultsToRerank.length),
          return_documents: false, // We don't need the full documents back
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      const rerankResults = response.data.results || [];
      
      if (!Array.isArray(rerankResults)) {
        throw new AppError('Invalid rerank response format', 500);
      }

      // Map rerank results back to original results with scores
      const rerankedResults = rerankResults.map(rerankResult => {
        const originalResult = resultsToRerank[rerankResult.index];
        return {
          ...originalResult,
          rerankScore: rerankResult.relevance_score,
          rerankIndex: rerankResult.index,
        };
      });

      logger.debug('Reranking completed', {
        originalCount: resultsToRerank.length,
        rerankedCount: rerankedResults.length,
        topRerankScore: rerankedResults[0]?.rerankScore || 0,
      });

      return rerankedResults;
    } catch (error) {
      logger.error('Reranking failed', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for reranking API', 429);
      } else if (error.response?.status === 401) {
        throw new AppError('Invalid API key for reranking service', 401);
      } else if (error.response?.status >= 500) {
        throw new AppError('Reranking service temporarily unavailable', 503);
      }

      // If reranking fails, return original results without rerank scores
      logger.warn('Reranking failed, returning original results');
      return resultsToRerank.slice(0, topK).map(result => ({
        ...result,
        rerankScore: null,
        rerankIndex: null,
      }));
    }
  }

  /**
   * Rerank results with custom scoring weights
   * @param {string} query - Original search query
   * @param {Array} results - Array of search results to rerank
   * @param {number} topK - Number of top results to return
   * @param {object} weights - Scoring weights for different factors
   * @returns {Array} Reranked results with combined scores
   */
  async rerankWithWeights(query, results, topK = 10, weights = {}) {
    const defaultWeights = {
      rerankScore: 0.7,
      similarityScore: 0.3,
    };

    const finalWeights = { ...defaultWeights, ...weights };

    try {
      // First, get rerank scores
      const rerankedResults = await this.rerankResults(query, results, topK);

      // Combine scores with weights
      const combinedResults = rerankedResults.map(result => {
        const rerankScore = result.rerankScore || 0;
        const similarityScore = result.score || 0;
        
        const combinedScore = 
          (rerankScore * finalWeights.rerankScore) + 
          (similarityScore * finalWeights.similarityScore);

        return {
          ...result,
          combinedScore,
          rerankScore,
          similarityScore,
        };
      });

      // Sort by combined score
      combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

      logger.debug('Combined scoring completed', {
        topCombinedScore: combinedResults[0]?.combinedScore || 0,
        weights: finalWeights,
      });

      return combinedResults.slice(0, topK);
    } catch (error) {
      logger.error('Combined scoring failed', { error: error.message });
      
      // Fallback to original results
      return results.slice(0, topK).map(result => ({
        ...result,
        combinedScore: result.score || 0,
        rerankScore: null,
        similarityScore: result.score || 0,
      }));
    }
  }

  /**
   * Get reranking model information
   * @returns {object} Model information
   */
  getModelInfo() {
    return {
      model: this.model,
      maxDocuments: 100,
      maxQueryLength: 1000,
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh'],
    };
  }
}

// Create singleton instance
const rerankerService = new RerankerService();

module.exports = rerankerService;
