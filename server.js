require('dotenv').config();
const express = require('express');
const session = require('express-session');
// Postgres will be used for persistent storage on Render.com
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const app = express();

// Database setup
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  }
});

// Models
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  }
});

const ChatHistory = sequelize.define('ChatHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  response: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Set up associations
User.hasMany(ChatHistory);
ChatHistory.belongsTo(User);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000 // 1 day in milliseconds
  }
}));

// Authentication middleware (disabled for demo)
const requireAuth = (req, res, next) => {
  // Demo: allow all requests through
  next();
};

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/index.html');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'அனைத்து தகவல்களையும் நிரப்பவும்' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'இந்த மின்னஞ்சல் ஏற்கனவே பயன்படுத்தப்பட்டுள்ளது' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword
    });

    // Set session
    req.session.userId = user.id;
    
    res.json({ success: true, redirect: '/index.html' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'பதிவுப் பிழை' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்' });
    }

    // Set session
    req.session.userId = user.id;
    
    res.json({ success: true, redirect: '/index.html' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'உள்நுழைவு பிழை' });
  }
});

app.get('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'வெளியேறுவதில் பிழை' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, redirect: '/login' });
  });
});

// Get current user info
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId, { attributes: ['username', 'email'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ username: user.username, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'பயனர் தகவலை பெற முடியவில்லை' });
  }
});

// Save chat message and response
app.post('/api/chat/save', requireAuth, async (req, res) => {
  try {
    const { message, response } = req.body;
    if (!message || !response) {
      return res.status(400).json({ error: 'செய்தி மற்றும் பதில் தேவை' });
    }
    const chat = await ChatHistory.create({
      message,
      response,
      UserId: req.session.userId
    });
    res.json({ success: true, chat });
  } catch (error) {
    console.error('Error saving chat:', error);
    res.status(500).json({ error: 'செய்தியை சேமிக்க இயலவில்லை' });
  }
});

// Protected route - example for chat history
app.get('/api/chat/history', requireAuth, async (req, res) => {
  try {
    const history = await ChatHistory.findAll({
      where: { UserId: req.session.userId },
      order: [['timestamp', 'DESC']],
      limit: 50
    });
    res.json(history);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'சரித்திரத்தைப் பெறுவதில் பிழை' });
  }
});

// Serve index.html only if authenticated
app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync all models
    await sequelize.sync({ force: false }); // Set force: true to drop and recreate tables
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

startServer();
