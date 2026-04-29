const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

exports.setState = async (chatId, state) => {
  await redis.set(`bot_state:${chatId}`, JSON.stringify(state), 'EX', 1800); // 30 min expiry
};

exports.getState = async (chatId) => {
  const state = await redis.get(`bot_state:${chatId}`);
  return state ? JSON.parse(state) : null;
};

exports.clearState = async (chatId) => {
  await redis.del(`bot_state:${chatId}`);
};