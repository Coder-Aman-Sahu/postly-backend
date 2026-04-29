require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth.routes');

const userRoutes = require('./routes/user.routes');

const contentRoutes = require('./routes/content.routes');

const postsRoutes = require('./routes/posts.routes');

const bot = require('./bot');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use(helmet());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

app.use('/api/content', contentRoutes);
app.use('/api/posts', postsRoutes);


app.post('/api/bot/webhook', express.json(), (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

