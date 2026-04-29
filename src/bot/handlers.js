const { getState, setState, clearState } = require('./state');
const { generateContent } = require('../services/ai.service');
const { PrismaClient } = require('@prisma/client');
const { publishQueue } = require('../queues/publish.queue');
const prisma = new PrismaClient();

// Map a Telegram Chat ID to a generic user ID for the task sake, or authenticate them
const mockUserId = "some-seeded-uuid-from-your-db"; 

exports.handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start' || text === '/post') {
    await setState(chatId, { step: 'POST_TYPE' });
    return bot.sendMessage(chatId, "Hey! What type of post is this?", {
      reply_markup: { keyboard: [[{text: "Announcement"}, {text: "Thread"}], [{text: "Promotional"}, {text: "Educational"}]], one_time_keyboard: true }
    });
  }

  const state = await getState(chatId);
  if (!state) return bot.sendMessage(chatId, "Send /start to begin.");

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
      state.step = 'IDEA';
      await setState(chatId, state);
      return bot.sendMessage(chatId, "Tell me the idea or core message - keep it brief (max 500 chars).");

    case 'IDEA':
      bot.sendMessage(chatId, "Generating your content... ⏳");
      try {
        state.language = 'en'; // default
        const content = await generateContent(mockUserId, { ...state, idea: text });
        
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
        bot.sendMessage(chatId, "Failed to generate content. Please check your API keys and try again.");
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
        
        // Save to DB and enqueue
        const post = await prisma.post.create({
          data: {
            user_id: mockUserId, // Adjust this based on how you link Telegram users to your DB
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

        bot.sendMessage(chatId, "Posts scheduled successfully! Check /status for updates.");
        await clearState(chatId);
    }
};