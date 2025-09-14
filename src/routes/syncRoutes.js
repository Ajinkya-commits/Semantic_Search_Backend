const express = require('express');
const syncController = require('../controllers/syncController');
const { validateSyncRequest } = require('../middleware/validation');
const { syncRateLimit } = require('../middleware/security');
const { ensureStackIsolation, validateStackToken, validateStackIndex } = require('../middleware/stackValidation');

const router = express.Router();

router.use(syncRateLimit);
router.use(ensureStackIsolation);

/**
 * @route POST /api/sync/index-all
 * @desc Index all entries for a specific stack
 * @access Public (requires stackApiKey)
 */
router.post('/index-all', validateSyncRequest, validateStackToken, validateStackIndex, syncController.indexAllEntries);

/**
 * @route POST /api/sync/index-entry
 * @desc Index a specific entry for a specific stack
 * @access Public (requires stackApiKey)
 */
router.post('/index-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.indexEntry);

/**
 * @route POST /api/sync/remove-entry
 * @desc Remove entry from stack-specific index
 * @access Public (requires stackApiKey)
 */
router.post('/remove-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.removeEntry);

/**
 * @route POST /api/sync/update-entry
 * @desc Update entry in stack-specific index
 * @access Public (requires stackApiKey)
 */
router.post('/update-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.updateEntry);

/**
 * @route GET /api/sync/stats
 * @desc Get indexing statistics for a specific stack
 * @access Public (requires stackApiKey)
 */
router.get('/stats', validateStackToken, validateStackIndex, syncController.getIndexingStats);

/**
 * @route DELETE /api/sync/clear-index
 * @desc Clear entire stack-specific index (use with caution!)
 * @access Public (requires stackApiKey)
 */
router.delete('/clear-index', validateStackToken, validateStackIndex, syncController.clearIndex);

module.exports = router;
