const express = require('express');
const tokenController = require('../controllers/tokenController');
const { validateTokenRequest } = require('../middleware/validation');

const router = express.Router();

router.post('/refresh/:stackApiKey', validateTokenRequest, tokenController.refreshToken);
router.post('/refresh-all', tokenController.refreshAllTokens);
router.get('/status/:stackApiKey', validateTokenRequest, tokenController.getTokenStatus);
router.get('/status', tokenController.getAllTokensStatus);

module.exports = router;
