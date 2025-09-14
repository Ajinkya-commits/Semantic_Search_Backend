const { load } = require("cheerio");

/**
 * Extract meaningful text (excluding image URLs) from an entry object.
 * @param {object} entry - The data object to extract text from.
 * @param {Set<string>} excludeKeys - Keys to ignore during traversal (default: ['uid']).
 * @returns {object} { text: string }
 */
function extractContent(entry, excludeKeys = new Set(["uid"])) {
  const textParts = [];

  function walk(obj) {
    if (!obj) return;

    if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        if (excludeKeys.has(key)) continue;
        walk(value);
      }
    } else if (typeof obj === "string") {
      // Extract visible text, skipping any image URLs
      // If the text contains HTML tags, remove them
      if (/<[a-z][\s\S]*>/i.test(obj)) {
        const $ = load(obj);
        const cleanedText = $("body").text();
        if (cleanedText.trim()) textParts.push(cleanedText.trim());
      } else {
        // Plain text (excluding image URLs)
        textParts.push(obj.trim());
      }
    }
  }

  walk(entry);

  return {
    text: textParts.join(" ").trim(),
  };
}

module.exports = { extractContent };
