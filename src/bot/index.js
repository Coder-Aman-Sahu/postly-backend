const TelegramBot = require('node-telegram-bot-api');
const { handleMessage, handleCallbackQuery } = require('./handlers');

const token = process.env.TELEGRAM_BOT_TOKEN;

// Initialize bot for Webhook mode (required by the assignment for production)
const bot = new TelegramBot(token, { webHook: true });

bot.on('message', (msg) => handleMessage(bot, msg));
bot.on('callback_query', (query) => handleCallbackQuery(bot, query));

module.exports = bot;