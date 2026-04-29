const { Queue } = require('bullmq'); // Remove Worker here
const Redis = require('ioredis');

const redisOptions = {
  maxRetriesPerRequest: null,
  tls: { rejectUnauthorized: false },
  family: 4, 
  connectTimeout: 20000,
  // Add lazyConnect to avoid connecting until a job is actually added
  lazyConnect: true 
};

const connection = new Redis(process.env.REDIS_URL, redisOptions);
const publishQueue = new Queue('publish', { connection });

module.exports = { publishQueue };
