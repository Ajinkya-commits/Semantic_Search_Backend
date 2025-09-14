const express = require('express');
const fieldConfigController = require('../controllers/fieldConfigController');
const { validateFieldConfigRequest, validateTestExtraction } = require('../middleware/validation');

const router = express.Router();


router.get('/patterns/:contentType', fieldConfigController.getFieldPatterns);


router.post('/patterns/:contentType', validateFieldConfigRequest, fieldConfigController.addCustomPatterns);

router.post('/test-extraction', validateTestExtraction, fieldConfigController.testFieldExtraction);

router.get('/patterns', fieldConfigController.getAllContentTypePatterns);

module.exports = router;
