const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('../utils/crypto');
const prisma = new PrismaClient();

exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true, bio: true, default_tone: true, default_language: true } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, bio, default_tone, default_language } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { name, bio, default_tone, default_language },
      select: { name: true, bio: true, default_tone: true, default_language: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.storeAiKeys = async (req, res) => {
  try {
    const { openai_key, anthropic_key } = req.body;
    const data = {};
    if (openai_key) data.openai_key_enc = encrypt(openai_key);
    if (anthropic_key) data.anthropic_key_enc = encrypt(anthropic_key);

    await prisma.aIKey.upsert({
      where: { user_id: req.user.userId },
      update: data,
      create: { user_id: req.user.userId, ...data }
    });
    
    res.json({ message: 'API Keys securely encrypted and stored.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store keys' });
  }
};

exports.addSocialAccount = async (req, res) => {
  try {
    const { platform, access_token, refresh_token, handle } = req.body;
    const account = await prisma.socialAccount.create({
      data: {
        user_id: req.user.userId,
        platform,
        access_token_enc: encrypt(access_token),
        refresh_token_enc: refresh_token ? encrypt(refresh_token) : null,
        handle
      }
    });
    res.status(201).json({ message: 'Social account linked successfully', id: account.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to link account' });
  }
};

exports.listSocialAccounts = async (req, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { user_id: req.user.userId },
      select: { id: true, platform: true, handle: true, connected_at: true } // Exclude encrypted tokens!
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list accounts' });
  }
};

exports.removeSocialAccount = async (req, res) => {
  try {
    await prisma.socialAccount.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Social account disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove account' });
  }
};