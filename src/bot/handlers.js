const { getState, setState, clearState } = require('./state');
const { generateContent } = require('../services/ai.service');
const { PrismaClient } = require('@prisma/client');
const { publishQueue } = require('../queues/publish.queue');
const { encrypt } = require('../utils/crypto'); 

// Instantiate Prisma outside the handler to reuse connection
const prisma = new PrismaClient();

// Automatically create a real Database user for the Telegram Chat
async function getOrCreateUser(chatId, firstName) {
    try {
        const email = `${chatId}@telegram.bot`;
        let user = await prisma.user.findFirst({ where: { email } });
        
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    password_hash: "telegram_mock_password",
                    name: firstName || "Telegram User"
                }
            });
        }
        return user.id;
    } catch (error) {
        console.error("Database Error in getOrCreateUser:", error.message);
        throw error;
    }
}

exports.handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  try {
      // Get the real DB user ID for this chat
      const userId = await getOrCreateUser(chatId, msg.chat.first_name);

      if (text === '/start' || text === '/post') {
        await setState(chatId, { step: 'POST_TYPE', userId });
        return bot.sendMessage(chatId, "🚀 Welcome to Postly! What type of post are we creating today?", {
          reply_markup: { 
            keyboard: [[{text: "Announcement"}, {text: "Thread"}], [{text: "Promotional"}, {text: "Educational"}]], 
            one_time_keyboard: true,
            resize_keyboard: true
          }
        });
      }

      if (text === '/setkeys') {
        await setState(chatId, { step: 'AWAITING_OPENAI_KEY', userId });
        return bot.sendMessage(chatId, "🔐 Let's set up your API keys!\n\nPlease paste your **OpenAI API Key**.\n\nIf you want to skip, type 'skip'.", { parse_mode: "Markdown" });
      }

      const state = await getState(chatId);
      if (!state) return bot.sendMessage(chatId, "Send /start to begin a new post.");

      switch (state.step) {
        // --- API KEY FLOW ---
        case 'AWAITING_OPENAI_KEY':
            state.openai_key = text.toLowerCase() === 'skip' ? null : text;
            state.step = 'AWAITING_ANTHROPIC_KEY';
            await setState(chatId, state);
            return bot.sendMessage(chatId, "Great! Now, please paste your **Anthropic (Claude) API Key**.\n\nType 'skip' to finish.", { parse_mode: "Markdown" });

        case 'AWAITING_ANTHROPIC_KEY':
            const anthropic_key = text.toLowerCase() === 'skip' ? null : text;
            const dataToUpdate = {};
            if (state.openai_key) dataToUpdate.openai_key_enc = encrypt(state.openai_key);
            if (anthropic_key) dataToUpdate.anthropic_key_enc = encrypt(anthropic_key);

            if (Object.keys(dataToUpdate).length > 0) {
                await prisma.aIKey.upsert({
                    where: { user_id: state.userId },
                    update: dataToUpdate,
                    create: { user_id: state.userId, ...dataToUpdate }
                });
                bot.sendMessage(chatId, "✅ Keys saved and encrypted! Now you can use /start to generate real content.");
            } else {
                bot.sendMessage(chatId, "No keys were saved. Using mock generation mode.");
            }
            await clearState(chatId);
            return;

        // --- POST GENERATION FLOW ---
        case 'POST_TYPE':
          state.post_type = text;
          state.step = 'PLATFORMS';
          await setState(chatId, state);
          return bot.sendMessage(chatId, "Which platforms? (e.g., twitter, linkedin)", { reply_markup: { remove_keyboard: true } });
        
        case 'PLATFORMS':
          state.platforms = text.split(',').map(p => p.trim().toLowerCase());
          state.step = 'TONE';
          await setState(chatId, state);
          return bot.sendMessage(chatId, "What tone? (Professional, Casual, Witty)");

        case 'TONE':
          state.tone = text;
          state.step = 'MODEL';
          await setState(chatId, state);
          return bot.sendMessage(chatId, "Which model? (openai or anthropic)");

        case 'MODEL':
          state.model = text.toLowerCase();
          state.step = 'IDEA';
          await setState(chatId, state);
          return bot.sendMessage(chatId, "Tell me your idea!");

        case 'IDEA':
          bot.sendMessage(chatId, "Generating content... ⏳");
          try {
            state.language = 'en'; 
            const content = await generateContent(state.userId, { ...state, idea: text });
            
            let preview = '✨ **Generated Content Preview** ✨\n\n';
            if (content.generated.twitter) preview += `🐦 **Twitter:**\n${content.generated.twitter.content}\n\n`;
            if (content.generated.linkedin) preview += `💼 **LinkedIn:**\n${content.generated.linkedin.content}\n\n`;
            
            bot.sendMessage(chatId, preview + "Would you like to post this?", {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{text: "✅ Yes, Post Now", callback_data: "post"}, {text: "❌ Cancel", callback_data: "cancel"}]] }
            });
            
            state.content = content;
            state.step = 'CONFIRM';
            state.idea = text; // Ensure idea is saved for the DB
            await setState(chatId, state);
          } catch (error) {
            bot.sendMessage(chatId, "❌ AI Generation failed. This happens if your API keys are missing or invalid. Use /setkeys to add them.");
            await clearState(chatId);
          }
          break;
          
        default:
          bot.sendMessage(chatId, "Not sure what you mean! Send /start to begin.");
      }
  } catch (err) {
      console.error("Critical Bot Handler Error:", err);
      bot.sendMessage(chatId, "⚠️ A database connection error occurred. Please try again in a few seconds.");
  }
};

exports.handleCallbackQuery = async (bot, query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    const state = await getState(chatId);

    if (action === 'cancel') {
        bot.sendMessage(chatId, "Cancelled. Send /start to try again.");
        await clearState(chatId);
        return;
    }

    if (action === 'post' && state && state.step === 'CONFIRM') {
        try {
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

            bot.sendMessage(chatId, "Success! Your content is being published in the background.");
            await clearState(chatId);
        } catch (err) {
            bot.sendMessage(chatId, "Failed to save the post to the database. Please try again.");
        }
    }
};