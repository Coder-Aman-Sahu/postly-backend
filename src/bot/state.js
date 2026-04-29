const { Redis } = require('@upstash/redis');

/**
 * Initialize Upstash Redis using HTTP.
 * This is the recommended approach for Vercel/Serverless to avoid ETIMEDOUT.
 */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Sets the state for a specific chat.
 * @param {number|string} chatId 
 * @param {object} state 
 */
exports.setState = async (chatId, state) => {
  try {
    // Upstash SDK automatically handles JSON stringification
    await redis.set(`bot_state:${chatId}`, state, { ex: 1800 });
  } catch (err) {
    console.error('Failed to set Redis state:', err.message);
  }
};

/**
 * Retrieves the state for a specific chat.
 * @param {number|string} chatId 
 * @returns {object|null}
 */
exports.getState = async (chatId) => {
  try {
    const state = await redis.get(`bot_state:${chatId}`);
    // Upstash SDK automatically parses JSON strings back into objects
    return state || null;
  } catch (err) {
    console.error('Failed to get Redis state:', err.message);
    return null;
  }
};

/**
 * Clears the state for a specific chat.
 * @param {number|string} chatId 
 */
exports.clearState = async (chatId) => {
  try {
    await redis.del(`bot_state:${chatId}`);
  } catch (err) {
    console.error('Failed to clear Redis state:', err.message);
  }
};