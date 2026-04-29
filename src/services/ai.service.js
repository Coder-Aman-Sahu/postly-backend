const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const { decrypt } = require('../utils/crypto');
const prisma = new PrismaClient();

exports.generateContent = async (userId, { idea, post_type, platforms, tone, language, model }) => {
  const keys = await prisma.aIKey.findUnique({ where: { user_id: userId } });
  
  const systemPrompt = `You are an expert social media manager. Create content for the following idea: "${idea}". 
  Tone: ${tone}. Language: ${language}. Type: ${post_type}.
  Target platforms: ${(platforms || []).join(', ')}.
  Rules:
  - Twitter: max 280 chars, 2-3 hashtags.
  - LinkedIn: 800-1300 chars, professional.
  - Instagram: caption + emojis + 10-15 hashtags.
  - Threads: max 500 chars, conversational.
  Return STRICTLY JSON format: { "generated": { "twitter": {"content": "...", "char_count": 0, "hashtags": []}, ... } }`;

  if (model.includes('gpt')) {
    const openai = new OpenAI({ apiKey: keys?.openai_key_enc ? decrypt(keys.openai_key_enc) : process.env.DEFAULT_OPENAI_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
  } else if (model.includes('claude')) {
    const anthropic = new Anthropic({ apiKey: keys?.anthropic_key_enc ? decrypt(keys.anthropic_key_enc) : process.env.DEFAULT_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate the JSON response now." }]
    });
    return JSON.parse(response.content[0].text);
  }
};
