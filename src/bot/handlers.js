const { getState, setState, clearState } = require('./state');
const { generateContent } = require('../services/ai.service');
const { PrismaClient } = require('@prisma/client');
const { publishQueue } = require('../queues/publish.queue');
const { encrypt } = require('../utils/crypto'); 

const prisma = new PrismaClient();

// Automatically creates a database entry for the Telegram user
async function getOrCreateUser(chatId, firstName) {
    const email = `${chatId}@telegram.bot`;
    let user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email,
                password_hash: "telegram_managed_user",
                name: firstName || "Telegram User"
            }
        });
    }
    return user.id;
}

exports.handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  try {
    const userId = await getOrCreateUser(chatId, msg.chat.first_name);

    if (text === '/start' || text === '/post') {
      await setState(chatId, { step: 'POST_TYPE', userId });
      return bot.sendMessage(chatId, "Welcome to Postly! What type of post are we creating?", {
        reply_markup: { 
          keyboard: [[{text: "Announcement"}, {text: "Thread"}], [{text: "Promotional"}, {text: "Educational"}]], 
          one_time_keyboard: true, resize_keyboard: true 
        }
      });
    }

    const state = await getState(chatId);
    if (!state) return bot.sendMessage(chatId, "Please send /start to begin.");

    switch (state.step) {
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
        return bot.sendMessage(chatId, "Which AI model? (openai or anthropic)");

      case 'MODEL':
        state.model = text.toLowerCase();
        state.step = 'AWAITING_KEY';
        await setState(chatId, state);
        return bot.sendMessage(chatId, `Please paste your **${state.model} API Key**.\n\nType 'skip' to use the default/mock mode.`, { parse_mode: "Markdown" });

      case 'AWAITING_KEY':
        if (text.toLowerCase() !== 'skip') {
          const updateData = state.model === 'openai' ? { openai_key_enc: encrypt(text) } : { anthropic_key_enc: encrypt(text) };
          await prisma.aIKey.upsert({
            where: { user_id: state.userId },
            update: updateData,
            create: { user_id: state.userId, ...updateData }
          });
          bot.sendMessage(chatId, "🔐 Key encrypted and saved securely!");
        }
        state.step = 'IDEA';
        await setState(chatId, state);
        return bot.sendMessage(chatId, "Finally, what is the core idea for the post?");

      case 'IDEA':
        bot.sendMessage(chatId, "Generating your content... ⏳");
        try {
          state.idea = text;
          const content = await generateContent(state.userId, { ...state, idea: text });
          state.content = content;
          state.step = 'CONFIRM';
          await setState(chatId, state);
          
          let preview = "📝 **Preview:**\n\n";
          if (content.generated.twitter) preview += `🐦 Twitter: ${content.generated.twitter.content}\n\n`;
          if (content.generated.linkedin) preview += `💼 LinkedIn: ${content.generated.linkedin.content}\n\n`;

          bot.sendMessage(chatId, preview + "Confirm publishing?", {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [[{text: "✅ Yes, Post", callback_data: "post"}, {text: "❌ Cancel", callback_data: "cancel"}]] }
          });
        } catch (e) {
          bot.sendMessage(chatId, "❌ AI error. Check your API key and try /start again.");
          await clearState(chatId);
        }
        break;
    }
  } catch (err) {
    console.error("Bot Error:", err);
    bot.sendMessage(chatId, "⚠️ Connection issue. Please try again in a moment.");
  }
};

exports.handleCallbackQuery = async (bot, query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    const state = await getState(chatId);

    if (action === 'post' && state?.step === 'CONFIRM') {
        const post = await prisma.post.create({
          data: {
            user_id: state.userId, idea: state.idea, post_type: state.post_type, tone: state.tone, language: 'en', model_used: state.model, status: 'queued',
            platform_posts: { create: Object.keys(state.content.generated).map(p => ({ platform: p, content: state.content.generated[p].content, status: 'queued' })) }
          },
          include: { platform_posts: true }
        });

        for (const pp of post.platform_posts) {
          await publishQueue.add('publish', { platform_post_id: pp.id, platform: pp.platform, content: pp.content });
        }

        bot.sendMessage(chatId, "🚀 Scheduled! Check your dashboard for status updates.");
        await clearState(chatId);
    } else {
        await clearState(chatId);
        bot.sendMessage(chatId, "Action cancelled.");
    }
};