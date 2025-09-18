const contentstackService = require("../services/contentstackService");
const OAuthToken = require("../models/OAuthToken");
const SearchLog = require("../models/SearchLog");
const { AppError } = require("../middleware/errorHandler");

async function enrichResultsWithContentstackData(
  results,
  stackApiKey,
  environment
) {
  if (!results || results.length === 0) {
    return [];
  }

  try {
    if (!stackApiKey) {
      const tokens = await OAuthToken.findActiveTokens();
      if (tokens.length === 0) {
        throw new AppError("No active stacks found", 404);
      }
      stackApiKey = tokens[0].stackApiKey;
    }

    console.log(
      ` Enriching ${results.length} results with Contentstack data...`
    );

    const enrichedResults = [];

    for (const result of results) {
      try {
        const { id: uid, contentType } = result;

        console.log(` Fetching entry: ${uid} (${contentType})`);
        console.log(
          ` Original scores - similarity: ${result.similarity}, score: ${result.score}, rerankScore: ${result.rerankScore}`
        );

        const entry = await contentstackService.fetchEntryByUid(
          stackApiKey,
          contentType,
          uid,
          environment
        );

        if (entry && entry.entry) {
          console.log(
            ` Successfully enriched: ${entry.entry.title || entry.entry.name || uid}`
          );

          enrichedResults.push({
            uid,
            contentType,
            similarity: result.score,
            rerankScore: result.rerankScore,
            score: result.score,
            ...entry.entry,
          });
        } else {
          console.warn(` No entry data returned for ${uid}`);
        }
      } catch (error) {
        console.warn(`Failed to enrich result ${result.id}`, {
          error: error.message,
        });
      }
    }

    console.log(
      ` Successfully enriched ${enrichedResults.length}/${results.length} results`
    );
    return enrichedResults;
  } catch (error) {
    console.error("Failed to enrich results with Contentstack data", {
      error: error.message,
    });
    throw error;
  }
}

async function logSearch(
  req,
  query,
  resultsCount,
  filters,
  responseTime,
  success,
  errorMessage = null
) {
  try {
    console.log("Attempting to log search:", {
      query: query ? query.substring(0, 50) : "N/A",
      stackApiKey: req.query.stackApiKey || req.stackApiKey || "unknown",
      resultsCount,
      responseTime,
      success,
      hasError: !!errorMessage,
    });

    const searchLog = new SearchLog({
      query,
      stackApiKey: req.query.stackApiKey || req.stackApiKey || "unknown",
      resultsCount,
      filters,
      responseTime,
      userAgent: req.get("User-Agent"),
      ipAddress: req.ip,
      environment: req.query.environment || "development",
      success,
      errorMessage,
    });

    const savedLog = await searchLog.save();
    console.log("Search log saved successfully:", {
      id: savedLog._id,
      query: savedLog.query.substring(0, 50),
      stackApiKey: savedLog.stackApiKey,
    });
  } catch (error) {
    console.error("Failed to log search", {
      error: error.message,
      stack: error.stack,
      query: query ? query.substring(0, 100) : "N/A",
    });
  }
}

module.exports = {
  enrichResultsWithContentstackData,
  logSearch,
};
