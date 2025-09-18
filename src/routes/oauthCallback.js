const express = require("express");
const axios = require("axios");
const { saveOrUpdateToken } = require("../services/tokenService");
const pineconeIndexService = require("../services/pineconeIndexService");

const oauthCallbackRouter = express.Router();

oauthCallbackRouter.get("/oauth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code)
    return res.status(400).json({ error: "Missing authorization code" });

  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.CONTENTSTACK_CLIENT_ID,
    client_secret: process.env.CONTENTSTACK_CLIENT_SECRET,
    redirect_uri: process.env.CONTENTSTACK_REDIRECT_URI,
    code,
  });

  try {
    const tokenResponse = await axios.post(
      "https://eu-app.contentstack.com/apps-api/token",
      payload.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const tokenData = tokenResponse.data;
    console.log("Raw token response:", JSON.stringify(tokenData, null, 2));
    
    const mappedTokenData = {
      stackApiKey: tokenData.stack_api_key,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in
    };
    
    console.log("Mapped token data:", JSON.stringify(mappedTokenData, null, 2));
    await saveOrUpdateToken(mappedTokenData);

    try {
      console.log(`Creating Pinecone index for stack: ${tokenData.stack_api_key}`);
      const indexResult = await pineconeIndexService.createIndex(tokenData.stack_api_key);
      console.log("Index creation result:", indexResult);
    } catch (indexError) {
      console.error("Failed to create Pinecone index for stack:", {
        stackApiKey: tokenData.stack_api_key,
        error: indexError.message
      });
    }

    const redirectUrl = `https://eu-app.contentstack.com/#!/stack/${tokenData.stack_api_key}/dashboard`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth callback error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    const errorMessage = error.response?.data?.message || error.message || "Unknown error";
    res.status(500).json({ 
      error: "Failed during OAuth callback process",
      details: errorMessage
    });
  }
});

module.exports = oauthCallbackRouter;
