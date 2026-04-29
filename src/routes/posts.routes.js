const express = require('express');
const router = express.Router();
const postsController = require('../controllers/posts.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/publish', postsController.publishPost);
router.post('/schedule', postsController.publishPost); // Reuses publish, logic handles 'publish_at'
router.get('/', postsController.listPosts);
router.get('/:id', postsController.getPost);
router.post('/:id/retry', postsController.retryPost);
router.delete('/:id', postsController.deletePost);

module.exports = router;