const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [totalPosts, successPosts, platformStats] = await Promise.all([
      prisma.post.count({ where: { user_id: userId } }),
      prisma.platformPost.count({ where: { post: { user_id: userId }, status: 'published' } }),
      prisma.platformPost.groupBy({
        by: ['platform'],
        where: { post: { user_id: userId } },
        _count: { platform: true }
      })
    ]);

    const successRate = totalPosts === 0 ? 0 : ((successPosts / (totalPosts * 2)) * 100).toFixed(2); // Approximating based on platforms

    res.json({
      data: {
        total_posts: totalPosts,
        success_rate: `${successRate}%`,
        posts_per_platform: platformStats.reduce((acc, curr) => {
          acc[curr.platform] = curr._count.platform;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};