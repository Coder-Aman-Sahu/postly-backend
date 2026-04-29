const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Shared configuration for robust Upstash connection on Vercel
const redisOptions = {
  maxRetriesPerRequest: null,
  tls: {
    rejectUnauthorized: false
  },
  family: 4, // Force IPv4 to bypass Vercel socket hangups
  connectTimeout: 20000
};

const connection = new Redis(process.env.REDIS_URL, redisOptions);

connection.on('error', (err) => console.error('Queue Redis Error:', err.message));

const publishQueue = new Queue('publish', { connection });

const worker = new Worker('publish', async job => {
  const { platform_post_id, platform, content } = job.data;
  
  // Simulation logic for the assignment
  const isSuccess = Math.random() > 0.3; 
  
  if (!isSuccess) throw new Error(`${platform} API Rate Limit Exceeded`);

  await prisma.platformPost.update({
    where: { id: platform_post_id },
    data: { status: 'published', published_at: new Date() }
  });

  return { success: true };
}, { 
  connection,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
});

module.exports = { publishQueue };