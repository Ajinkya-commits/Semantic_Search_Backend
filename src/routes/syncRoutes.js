const express = require('express');
const syncController = require('../controllers/syncController');
const { validateSyncRequest } = require('../middleware/validation');
const { ensureStackIsolation, validateStackToken, validateStackIndex } = require('../middleware/stackValidation');

const router = express.Router();

router.use(ensureStackIsolation);

router.post('/index-all', validateSyncRequest, validateStackToken, validateStackIndex, syncController.indexAllEntries);

router.post('/index-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.indexEntry);

router.post('/remove-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.removeEntry);

router.post('/update-entry', validateSyncRequest, validateStackToken, validateStackIndex, syncController.updateEntry);

router.get('/stats', validateStackToken, validateStackIndex, syncController.getIndexingStats);


router.delete('/clear-index', validateStackToken, validateStackIndex, syncController.clearIndex);

module.exports = router;
