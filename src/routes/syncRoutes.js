const express = require('express');
const syncController = require('../controllers/syncController');
const { autoDetectStackApiKey } = require('../middleware/auth');

const router = express.Router();

router.use(autoDetectStackApiKey);

router.post('/index-all', syncController.indexAllEntries);
router.post('/index-entry', syncController.indexEntry);
router.post('/remove-entry', syncController.removeEntry);
router.post('/update-entry', syncController.updateEntry);
router.get('/stats', syncController.getIndexingStats);
router.delete('/clear-index', syncController.clearIndex);

module.exports = router;
