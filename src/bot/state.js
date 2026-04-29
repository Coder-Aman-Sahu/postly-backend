const Redis = require('ioredis');

// Force IPv4 and add robust TLS settings for Vercel/Upstash handshake
const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false // Required for serverless-to-managed Redis
  },
  family: 4, // Force IPv4 to avoid Vercel handshake issues
  connectTimeout: 20000, // Increase timeout for serverless cold starts
  maxRetriesPerRequest: null
});

redis.on('error', (err) => {
    // Log errors but prevent the app from crashing
    console.error('Redis Client Error:', err.message);
});

exports.setState = async (chatId, state) => {
  try {
    await redis.set(`bot_state:${chatId}`, JSON.stringify(state), 'EX', 1800);
  } catch (err) {
    console.error('Failed to set Redis state:', err);
  }
};

exports.getState = async (chatId) => {
  try {
    const state = await redis.get(`bot_state:${chatId}`);
    return state ? JSON.parse(state) : null;
  } catch (err) {
    console.error('Failed to get Redis state:', err);
    return null;
  }
};

exports.clearState = async (chatId) => {
  try {
    await redis.del(`bot_state:${chatId}`);
  } catch (err) {
    console.error('Failed to clear Redis state:', err);
  }
};