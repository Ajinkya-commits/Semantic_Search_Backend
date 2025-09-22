const axios = require("axios");
const { AppError } = require("../middleware/errorHandler");

const PYTHON_SERVICE_URL =
  process.env.IMAGE_EMBEDDING_SERVICE_URL || "http://localhost:5000";

async function checkPythonService() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    return response.data.status === "healthy";
  } catch (error) {
    console.warn(
      "Python Image Embedding Service not available:",
      error.message
    );
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
        `Image embedding failed: ${error.response.data?.error || "Unknown error"}`,
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
    const base64Image = imageBuffer.toString("base64");
    const dataUri = `data:${mimeType};base64,${base64Image}`;
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/embed/base64`,
      {
        image_data: dataUri,
        mime_type: mimeType,
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

function padEmbeddingTo1536(embedding) {
  if (embedding.length === 1536) {
    return embedding;
  }

  if (embedding.length === 768) {
    const padded = new Array(1536).fill(0);
    for (let i = 0; i < 768; i++) {
      padded[i] = embedding[i];
    }
    for (let i = 768; i < 1536; i++) {
      const sourceIndex = i % 768;
      padded[i] = embedding[sourceIndex] * 0.1;
    }

    return padded;
  }
  const padded = new Array(1536).fill(0);
  const copyLength = Math.min(embedding.length, 1536);

  for (let i = 0; i < copyLength; i++) {
    padded[i] = embedding[i];
  }
  return padded;
}

checkPythonService().then((available) => {
  if (available) {
    console.log("Python Image Embedding Service (DINOv2) is available");
  } else {
    console.warn("Service not available");
  }
});

module.exports = {
  embedImage,
  embedImageFromFile,
  checkPythonService,
};
