require("express-async-errors");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const connectDB = require("./database/connection");
const config = require("./config");

const searchRoutes = require("./routes/searchRoutes");
const configRoutes = require("./routes/configRoutes");
const syncRoutes = require("./routes/syncRoutes");
const translationRoutes = require("./routes/translationRoutes");
const imageSearchRoutes = require("./routes/imageSearchRoutes");
const oauthCallbackRouter = require("./routes/oauthCallback");
const webhookRouter = require("./routes/webhookRoutes");

const app = express();
const port = config.server.port;

const connectDatabase = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

const setupMiddleware = () => {
  app.use(
    cors({
      origin: process.env.FRONTEND_URL,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
};

const setupRoutes = () => {
  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "Semantic Search Backend",
    });
  });

  app.use("/api/search", searchRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api/translate", translationRoutes);
  app.use("/api/image-search", imageSearchRoutes);
  app.use("/", oauthCallbackRouter);
  app.use("/", webhookRouter);

};

const setupErrorHandling = () => {
  app.use(notFound);
  app.use(errorHandler);
};

const start = async () => {
  await connectDatabase();
  setupMiddleware();
  setupRoutes();
  setupErrorHandling();

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Health Check: http://localhost:${port}/health`);
  });
};

start();

module.exports = app;
