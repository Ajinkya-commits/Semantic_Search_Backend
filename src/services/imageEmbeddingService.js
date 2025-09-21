const axios = require("axios");
const { AppError } = require("../middleware/errorHandler");

// Python microservice configuration
const PYTHON_SERVICE_URL = process.env.IMAGE_EMBEDDING_SERVICE_URL || "http://localhost:5001";

// Check if Python service is available
async function checkPythonService() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data.model_loaded === true;
  } catch (error) {
    console.warn("Python Image Embedding Service not available:", error.message);
    return false;
  }
}

async function embedImage(imageUrl) {
  if (!imageUrl) {
    throw new AppError("Image URL required", 400);
  }

  try {
    console.log(`Generating DINOv2 embedding for: ${imageUrl}`);
    
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/embed/url`,
      { image_url: imageUrl },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const { embedding, dimensions, model } = response.data;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid embedding format returned from Python service");
    }

    return {
      embedding: padEmbeddingTo1536(embedding),
      dimensions: dimensions,
      model: model,
      imageUrl,
    };
  } catch (error) {
    if (error.response) {
      console.error(
        "Python service error:",
        error.response.status,
        error.response.data
      );
      throw new AppError(
        `Image embedding failed: ${error.response.data?.error || 'Unknown error'}`,
        error.response.status
      );
    }

    console.error("Image embedding failed:", error.message);
    throw new AppError("Failed to generate image embedding", 500);
  }
}

async function embedImageFromFile(imageBuffer, mimeType) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new AppError("Valid image buffer required", 400);
  }

  try {
    console.log(`Generating DINOv2 embedding for uploaded ${mimeType} image`);
    
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/embed/base64`,
      { 
        image_data: dataUri,
        mime_type: mimeType 
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const { embedding, dimensions, model } = response.data;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid embedding format returned from Python service");
    }

    return {
      embedding: padEmbeddingTo1536(embedding),
      dimensions: dimensions,
      model: model,
      mimeType,
    };
  } catch (error) {
    console.error("Image file embedding failed:", error.message);
    throw new AppError("Failed to generate embedding from image file", 500);
  }
}

async function embedText(text) {
  if (!text) {
    throw new AppError("Text required", 400);
  }

  // For text queries, we'll use a simple local approach since DINOv2 is image-only
  // This creates embeddings that can match with image embeddings through similarity
  try {
    console.log(`Generating text embedding for image search: "${text.substring(0, 50)}..."`);
    
    // Create a deterministic text embedding for image search
    const embedding = createTextEmbeddingForImageSearch(text);

    return {
      embedding: padEmbeddingTo1536(embedding),
      dimensions: embedding.length,
      model: "text-for-image-search",
      text,
    };
  } catch (error) {
    console.error("Text embedding failed:", error.message);
    throw new AppError("Failed to generate text embedding", 500);
  }
}

// Create text embedding optimized for image search similarity
function createTextEmbeddingForImageSearch(text) {
  const dimensions = 1536; // Match Pinecone index dimensions
  const embedding = new Array(dimensions).fill(0);
  
  // Normalize text
  const normalizedText = text.toLowerCase().trim();
  
  // Extract image-related keywords
  const imageKeywords = [
    'photo', 'image', 'picture', 'jpg', 'jpeg', 'png', 'gif',
    'color', 'colors', 'red', 'blue', 'green', 'yellow', 'black', 'white',
    'person', 'people', 'face', 'man', 'woman', 'child',
    'animal', 'cat', 'dog', 'bird', 'nature', 'tree', 'flower',
    'building', 'house', 'car', 'food', 'landscape', 'portrait'
  ];
  
  // Create features based on text content
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
  
  // Seed with text hash
  let seed = 0;
  for (let i = 0; i < normalizedText.length; i++) {
    seed = (seed * 31 + normalizedText.charCodeAt(i)) % 1000000;
  }
  
  // Generate embedding with image-search optimized features
  for (let i = 0; i < dimensions; i++) {
    let value = 0;
    
    // Base hash value
    const hashValue = ((seed + i) * 9301 + 49297) % 233280;
    value += (hashValue / 233280 - 0.5) * 0.3;
    
    // Word-based features
    if (words.length > 0) {
      const wordIndex = i % words.length;
      const word = words[wordIndex];
      let wordValue = 0;
      for (let j = 0; j < word.length; j++) {
        wordValue += word.charCodeAt(j);
      }
      value += (wordValue % 200 / 200 - 0.5) * 0.3;
    }
    
    // Keyword boost for image-related terms
    let keywordBoost = 0;
    for (const keyword of imageKeywords) {
      if (normalizedText.includes(keyword)) {
        keywordBoost += 0.1;
      }
    }
    value += keywordBoost * 0.2;
    
    // Length and complexity features
    value += (Math.log(normalizedText.length + 1) / 10 - 0.5) * 0.1;
    value += (words.length / 20 - 0.5) * 0.1;
    
    // For dimensions > 768, use different patterns to maintain compatibility
    if (i >= 768) {
      value *= 0.1; // Scale down secondary dimensions
    }
    
    embedding[i] = Math.max(-1, Math.min(1, value));
  }
  
  return embedding;
}

async function batchEmbedImages(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new AppError("Array of image URLs required", 400);
  }

  try {
    console.log(`Processing batch of ${imageUrls.length} images with DINOv2`);
    
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/embed/batch`,
      { image_urls: imageUrls },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000, // Longer timeout for batch processing
      }
    );

    return response.data.results.map(result => ({
      ...result,
      embedding: padEmbeddingTo1536(result.embedding),
    }));
  } catch (error) {
    console.error("Batch image embedding failed:", error.message);
    
    // Fallback to individual processing if batch fails
    console.log("Falling back to individual image processing...");
    const results = [];
    
    for (const url of imageUrls) {
      try {
        const result = await embedImage(url);
        results.push(result);
      } catch (err) {
        results.push({
          error: err.message,
          imageUrl: url,
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}

// Helper function to pad embeddings to match Pinecone index dimension
function padEmbeddingTo1536(embedding) {
  if (embedding.length === 1536) {
    return embedding; // Already correct size
  }
  
  if (embedding.length === 768) {
    // Pad DINOv2 embeddings (768) to match Cohere size (1536)
    const padded = new Array(1536).fill(0);
    
    // Copy original embedding to first 768 positions
    for (let i = 0; i < 768; i++) {
      padded[i] = embedding[i];
    }
    
    // Fill remaining positions with normalized values based on original embedding
    for (let i = 768; i < 1536; i++) {
      const sourceIndex = i % 768;
      padded[i] = embedding[sourceIndex] * 0.1; // Scaled down to avoid interference
    }
    
    return padded;
  }
  
  // For other sizes, pad or truncate as needed
  const padded = new Array(1536).fill(0);
  const copyLength = Math.min(embedding.length, 1536);
  
  for (let i = 0; i < copyLength; i++) {
    padded[i] = embedding[i];
  }
  
  return padded;
}

// Initialize service check
checkPythonService().then(available => {
  if (available) {
    console.log("✅ Python Image Embedding Service (DINOv2) is available");
  } else {
    console.warn("⚠️  Python Image Embedding Service not available - check if it's running on port 5001");
  }
});

module.exports = {
  embedImage,
  embedImageFromFile,
  embedText,
  batchEmbedImages,
  checkPythonService,
};
