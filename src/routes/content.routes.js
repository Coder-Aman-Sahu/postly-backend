const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.post('/generate', authenticate, contentController.generate);

module.exports = router;
