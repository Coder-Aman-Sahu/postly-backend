const { PrismaClient } = require('@prisma/client');
const { publishQueue } = require('../queues/publish.queue');
const prisma = new PrismaClient();

exports.publishPost = async (req, res) => {
  try {
    const { idea, post_type, tone, language, model_used, generated_content, publish_at } = req.body;
    
    // Save Post Master Record
    const post = await prisma.post.create({
      data: {
        user_id: req.user.userId,
        idea, post_type, tone, language, model_used, status: 'queued',
        publish_at: publish_at ? new Date(publish_at) : null,
        platform_posts: {
          create: Object.keys(generated_content).map(platform => ({
            platform,
            content: generated_content[platform].content,
            status: 'queued'
          }))
        }
      },
      include: { platform_posts: true }
    });

    // Enqueue Jobs
    for (const platform_post of post.platform_posts) {
      const delay = publish_at ? new Date(publish_at).getTime() - Date.now() : 0;
      await publishQueue.add('publish', { 
          platform_post_id: platform_post.id, 
          platform: platform_post.platform, 
          content: platform_post.content 
      }, { delay: Math.max(delay, 0) });
    }

    res.status(201).json({ message: 'Post queued for publishing', post });
  } catch (error) {
    res.status(500).json({ error: 'Failed to queue post' });
  }
};

exports.listPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { user_id: req.user.userId },
        include: { platform_posts: true },
        skip, take: limit, orderBy: { created_at: 'desc' }
      }),
      prisma.post.count({ where: { user_id: req.user.userId } })
    ]);

    res.json({ data: posts, meta: { total, page, limit } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
};

exports.getPost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { platform_posts: true }
    });
    if (!post || post.user_id !== req.user.userId) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
};

exports.retryPost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { platform_posts: { where: { status: 'failed' } } }
    });
    
    if (!post || post.user_id !== req.user.userId) return res.status(404).json({ error: 'Post not found' });

    for (const platform_post of post.platform_posts) {
      await prisma.platformPost.update({ where: { id: platform_post.id }, data: { status: 'queued', attempts: 0 } });
      await publishQueue.add('publish', { platform_post_id: platform_post.id, platform: platform_post.platform, content: platform_post.content });
    }

    res.json({ message: 'Failed platforms re-queued for publishing' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retry post' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.user_id !== req.user.userId) return res.status(404).json({ error: 'Post not found' });

    await prisma.platformPost.deleteMany({ where: { post_id: req.params.id } });
    await prisma.post.delete({ where: { id: req.params.id } });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
};
