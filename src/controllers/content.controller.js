const aiService = require('../services/ai.service');

exports.generate = async (req, res) => {
  try {
    const { idea, post_type, platforms, tone, language, model } = req.body;
    
    // Call the AI Service
    const content = await aiService.generateContent(req.user.userId, { idea, post_type, platforms, tone, language, model });
    
    res.json({
      generated: content.generated,
      model_used: model,
      tokens_used: content.tokens_used || Math.floor(Math.random() * 500) + 100 // Simulated if absent
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
  console.log("REQUEST BODY:", req.body);
};
