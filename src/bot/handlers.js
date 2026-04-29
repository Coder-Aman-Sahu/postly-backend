const { getState, setState, clearState } = require('./state');
const { generateContent } = require('../services/ai.service');
const { PrismaClient } = require('@prisma/client');
const { publishQueue } = require('../queues/publish.queue');
const { encrypt } = require('../utils/crypto'); 
const prisma = new PrismaClient();

// Automatically create a real Database user for the Telegram Chat
// This prevents database foreign-key errors and gives us a place to securely save their API keys.
async function getOrCreateUser(chatId, firstName) {
    let user = await prisma.user.findFirst({ where: { email: `${chatId}@telegram.bot` } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: `${chatId}@telegram.bot`,
                password_hash: "telegram_mock_password",
                name: firstName || "Telegram User"
            }
        });
    }
    return user.id;
}

exports.handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  const userId = await getOrCreateUser(chatId, msg.chat.first_name);

  if (text === '/start' || text === '/post') {
    await setState(chatId, { step: 'POST_TYPE', userId });
    return bot.sendMessage(chatId, "Hey! What type of post is this?", {
      reply_markup: { keyboard: [[{text: "Announcement"}, {text: "Thread"}], [{text: "Promotional"}, {text: "Educational"}]], one_time_keyboard: true }
    });
  }

  const state = await getState(chatId);
  if (!state) return bot.sendMessage(chatId, "Send /start to generate a post.");

  switch (state.step) {
    case 'POST_TYPE':
      state.post_type = text;
      state.step = 'PLATFORMS';
      await setState(chatId, state);
      return bot.sendMessage(chatId, "Which platforms? (Reply with comma-separated: twitter, linkedin, instagram, threads)", {
          reply_markup: { remove_keyboard: true }
      });
    
    case 'PLATFORMS':
      state.platforms = text.split(',').map(p => p.trim().toLowerCase());
      state.step = 'TONE';
      await setState(chatId, state);
      return bot.sendMessage(chatId, "What tone should the content have? (e.g., Professional, Casual, Witty)");

    case 'TONE':
      state.tone = text;
      state.step = 'MODEL';
      await setState(chatId, state);
      return bot.sendMessage(chatId, "Which AI model? (openai or anthropic)");

    case 'MODEL':
      state.model = text.toLowerCase();
      state.step = 'AWAITING_API_KEY';
      await setState(chatId, state);
      
      const modelName = state.model === 'openai' ? 'OpenAI' : 'Anthropic (Claude)';
      return bot.sendMessage(chatId, `Please paste your **${modelName} API Key** to generate the content.\n\nIf you have already provided it before, or want to test the mock fallback, just type 'skip'.`, { parse_mode: "Markdown" });

    case 'AWAITING_API_KEY':
      // If they didn't skip, encrypt and save the key
      if (text.toLowerCase() !== 'skip') {
          const dataToUpdate = {};
          if (state.model === 'openai') dataToUpdate.openai_key_enc = encrypt(text);
          if (state.model === 'anthropic') dataToUpdate.anthropic_key_enc = encrypt(text);
          
          await prisma.aIKey.upsert({
              where: { user_id: state.userId },
              update: dataToUpdate,
              create: { user_id: state.userId, ...dataToUpdate }
          });
          bot.sendMessage(chatId, "✅ Your API key was securely encrypted and saved to your profile!");
      }

      state.step = 'IDEA';
      await setState(chatId, state);
      return bot.sendMessage(chatId, "Now, tell me the idea or core message - keep it brief (max 500 chars).");

    case 'IDEA':
      bot.sendMessage(chatId, "Generating your content... ⏳");
      try {
        state.language = 'en'; 
        const content = await generateContent(state.userId, { ...state, idea: text });
        
        let preview = '';
        if (content.generated.twitter) preview += `🐦 Twitter:\n${content.generated.twitter.content}\n\n`;
        if (content.generated.linkedin) preview += `💼 LinkedIn:\n${content.generated.linkedin.content}\n\n`;
        
        bot.sendMessage(chatId, preview + "Confirm and post?", {
            reply_markup: { inline_keyboard: [[{text: "Yes, Post Now", callback_data: "post"}, {text: "Cancel", callback_data: "cancel"}]] }
        });
        
        state.content = content;
        state.step = 'CONFIRM';
        await setState(chatId, state);
      } catch (error) {
        bot.sendMessage(chatId, "❌ Failed to generate content. This usually means the API key is missing or invalid. Send /start to try again.");
        await clearState(chatId);
      }
      break;
      
    default:
      bot.sendMessage(chatId, "I didn't understand that. Send /start to begin a new post.");
  }
};

exports.handleCallbackQuery = async (bot, query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    const state = await getState(chatId);

    if (action === 'cancel') {
        bot.sendMessage(chatId, "Post cancelled. Send /start to try again.");
        await clearState(chatId);
        return;
    }

    if (action === 'post' && state && state.step === 'CONFIRM') {
        bot.sendMessage(chatId, "Queuing your posts! 🚀");
        
        const post = await prisma.post.create({
          data: {
            user_id: state.userId,
            idea: state.idea, post_type: state.post_type, tone: state.tone, language: state.language, model_used: state.model, status: 'queued',
            platform_posts: {
              create: Object.keys(state.content.generated).map(platform => ({
                platform, content: state.content.generated[platform].content, status: 'queued'
              }))
            }
          },
          include: { platform_posts: true }
        });

        for (const pp of post.platform_posts) {
          await publishQueue.add('publish', { platform_post_id: pp.id, platform: pp.platform, content: pp.content });
        }

        bot.sendMessage(chatId, "Posts successfully scheduled in the background worker!");
        await clearState(chatId);
    }
};