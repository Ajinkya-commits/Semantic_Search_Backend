const axios = require("axios");
const config = require("../config");
const { AppError } = require("../middleware/errorHandler");

const rerankResults = async (query, results, topK = 10) => {
  if (!query || typeof query !== "string") {
    throw new AppError("Query is required and must be a string", 400);
  }

  if (!Array.isArray(results) || results.length === 0) {
    return results;
  }

  try {
    console.log(`Reranking ${results.length} results...`);

    const documents = results
      .map((result) => result.text || "")
      .filter((text) => text.length > 0);

    if (documents.length === 0) {
      console.log("No documents to rerank, returning original results");
      return results;
    }

    const response = await axios.post(
      `${config.apis.cohere.baseUrl}/rerank`,
      {
        model: config.apis.cohere.models.rerank,
        query: query,
        documents: documents,
        top_k: Math.min(topK, documents.length),
      },
      {
        headers: {
          Authorization: `Bearer ${config.apis.cohere.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.results) {
      console.log("No rerank results, returning original results");
      return results;
    }

    console.log(`Reranked ${response.data.results.length} results`);

    const rerankedResults = response.data.results.map((result) => {
      const originalResult = results[result.index];
      console.log(
        `Reranking result: original score=${originalResult.score}, rerank score=${result.relevance_score}`
      );

      return {
        ...originalResult,
        rerankScore: result.relevance_score,
        originalScore: originalResult.score,
      };
    });

    return rerankedResults;
  } catch (error) {
    console.error(
      "Reranking failed, returning original results:",
      error.message
    );
    return results;
  }
};

module.exports = {
  rerankResults,
};
