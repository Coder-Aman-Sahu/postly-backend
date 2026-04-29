const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate); // Apply auth middleware to all user routes

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/ai-keys', userController.storeAiKeys);
router.post('/social-accounts', userController.addSocialAccount);
router.get('/social-accounts', userController.listSocialAccounts);
router.delete('/social-accounts/:id', userController.removeSocialAccount);

module.exports = router;
