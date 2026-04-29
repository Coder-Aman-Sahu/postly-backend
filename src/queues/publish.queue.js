const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });

const publishQueue = new Queue('publish', { connection });

const worker = new Worker('publish', async job => {
  const { platform_post_id, platform, content } = job.data;
  console.log(`Processing publish for ${platform}...`);
  
  // Here, you would call the actual Twitter/LinkedIn API using stored OAuth tokens
  // For the assignment, we simulate success/failure:
  
  const isSuccess = Math.random() > 0.3; // 70% chance of success for testing
  
  if (!isSuccess) {
    throw new Error(`${platform} API Rate Limit Exceeded`);
  }

  // Update DB on success
  await prisma.platformPost.update({
    where: { id: platform_post_id },
    data: { status: 'published', published_at: new Date() }
  });

  return { success: true, url: `https://${platform}.com/post/${Date.now()}` };
}, { 
  connection,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 } // 1s -> 2s -> 4s
});

// Update DB on failure after all retries are exhausted
worker.on('failed', async (job, err) => {
  if (job.attemptsMade === job.opts.attempts) {
      await prisma.platformPost.update({
          where: { id: job.data.platform_post_id },
          data: { status: 'failed', error_message: err.message }
      });
  }
});

module.exports = { publishQueue };