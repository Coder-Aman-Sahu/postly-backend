const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { generateTokens } = require('../utils/jwt');
const prisma = new PrismaClient();

exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password_hash, name }
    });
    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const tokens = generateTokens(user.id);
    
    // Save the new refresh token in the DB
    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { refresh_token: tokens.refreshToken } 
    });
    
    res.json(tokens);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Verify token validity
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    // Ensure the token matches the one stored in the DB (prevents replay attacks if rotated)
    if (!user || user.refresh_token !== refresh_token) {
      return res.status(403).json({ error: 'Invalid or revoked refresh token' });
    }

    // Generate new set of tokens (Token Rotation)
    const tokens = generateTokens(user.id);
    
    // Update DB with the new refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: tokens.refreshToken }
    });

    res.json(tokens);
  } catch (error) {
    return res.status(403).json({ error: 'Expired or invalid refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    // Invalidate the refresh token in the database
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { refresh_token: null }
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, bio: true, default_tone: true, default_language: true, created_at: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
