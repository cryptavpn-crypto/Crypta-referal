import express from "express";
import cors from "cors";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// File per salvare i dati
const DATA_FILE = path.join(__dirname, 'data.json');

// Carica dati esistenti o inizializza
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Errore caricamento dati:', error);
  }
  
  return {
    users: [],
    tasks: [
      { id: 'twitter_follow', title: 'Follow CRYPTA VPN on X (Twitter)', points: 50 },
      { id: 'twitter_post', title: 'Post and tag us on X', points: 100 },
      { id: 'telegram_join', title: 'Join Telegram Channel', points: 75 }
    ]
  };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryDB, null, 2));
    console.log('💾 Data saved to file');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

let memoryDB = loadData();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Funzioni helper
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function findUserByUsername(username) {
  return memoryDB.users.find(user => user.username === username);
}

function findUserByEmail(email) {
  return memoryDB.users.find(user => user.email === email);
}

function findUserByReferralCode(code) {
  return memoryDB.users.find(user => user.referralCode === code);
}

function isValidEmail(email) {
  return email && email.includes('@') && email.includes('.');
}

// Calculate total points for a user
function calculateTotalPoints(user) {
  const taskPoints = (user.completedTasks || []).reduce((sum, task) => sum + task.points, 0);
  const referralPoints = (user.referralCount || 0) * 150;
  return taskPoints + referralPoints;
}

// 🔐 Login existing user
app.post("/api/referral/user/login", async (req, res) => {
  try {
    const { username, email } = req.body;
    
    if (!username && !email) {
      return res.json({ success: false, error: "Please enter username or email" });
    }

    let user;
    if (username) {
      user = findUserByUsername(username);
    } else if (email) {
      user = findUserByEmail(email);
    }

    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    // Update last activity
    user.lastActive = new Date();
    
    // Calculate total points
    user.totalPoints = calculateTotalPoints(user);
    
    saveData();

    console.log(`✅ User logged in: ${user.username}`);
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 📝 User registration
app.post("/api/referral/user/register", async (req, res) => {
  try {
    const { username, email, telegram, referredBy } = req.body;
    
    if (!username || !email) {
      return res.json({ success: false, error: "Username and email are required" });
    }

    if (!isValidEmail(email)) {
      return res.json({ success: false, error: "Please enter a valid email" });
    }

    // Check if user already exists
    const existingUser = findUserByUsername(username) || findUserByEmail(email);
    if (existingUser) {
      return res.json({ 
        success: false, 
        error: "User already registered",
        suggestion: "Use the login function" 
      });
    }

    const referralCode = generateReferralCode();
    const newUser = {
      username,
      email,
      telegram: telegram || '',
      referralCode,
      points: 0,
      referralCount: 0,
      completedTasks: [],
      referrals: [],
      referredBy: referredBy || null,
      createdAt: new Date(),
      lastActive: new Date()
    };

    memoryDB.users.push(newUser);
    saveData();

    if (referredBy) {
      const referrer = findUserByReferralCode(referredBy);
      if (referrer) {
        referrer.referralCount += 1;
        referrer.referrals.push({ username, email, joinedAt: new Date() });
        saveData();
      }
    }

    // Calculate total points for response
    newUser.totalPoints = calculateTotalPoints(newUser);

    console.log(`✅ New user: ${username} (${email})`);
    res.json({ success: true, user: newUser });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// ✅ Task verification (SIMULATED - you'll need real API integration)
app.post("/api/referral/task/verify", async (req, res) => {
  try {
    const { username, taskId } = req.body;
    
    const user = findUserByUsername(username);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    // Check if task is already completed
    const alreadyCompleted = user.completedTasks.some(task => task.taskId === taskId);
    if (alreadyCompleted) {
      return res.json({ success: false, error: "Task already completed" });
    }

    // Find the task for points
    const task = memoryDB.tasks.find(t => t.id === taskId);
    if (!task) {
      return res.json({ success: false, error: "Task not found" });
    }

    // 🔍 REAL VERIFICATION LOGIC WOULD GO HERE
    // For now, we simulate verification with 80% success rate
    const isVerified = Math.random() > 0.2; // 80% success rate
    
    setTimeout(() => {
      if (isVerified) {
        user.completedTasks.push({
          taskId,
          points: task.points,
          completedAt: new Date(),
          verified: true,
          verifiedAt: new Date()
        });
        
        // Update total points
        user.totalPoints = calculateTotalPoints(user);
        user.lastActive = new Date();
        saveData();

        console.log(`✅ Task verified: ${username} - ${taskId} (+${task.points} pts)`);
        res.json({ 
          success: true, 
          user,
          points: task.points,
          message: `Task completed! +${task.points} points!` 
        });
      } else {
        res.json({ 
          success: false, 
          error: "Task not completed yet. Please make sure you completed the action and try again." 
        });
      }
    }, 2000); // 2 second delay to simulate verification
    
  } catch (error) {
    console.error('Task verification error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 📊 Leaderboard with total points
app.get("/api/referral/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Calculate total points for all users and sort
    const leaderboard = memoryDB.users
      .map(user => ({
        ...user,
        totalPoints: calculateTotalPoints(user)
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit)
      .map((user, index) => ({
        username: user.username,
        points: user.totalPoints,
        referralCount: user.referralCount || 0,
        taskPoints: (user.completedTasks || []).reduce((sum, task) => sum + task.points, 0),
        referralPoints: (user.referralCount || 0) * 150,
        rank: index + 1
      }));

    res.json({ success: true, leaderboard });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 🔍 ADMIN: Get all data with total points
app.get("/api/admin/data", (req, res) => {
  try {
    const usersWithTotals = memoryDB.users.map(user => ({
      ...user,
      totalPoints: calculateTotalPoints(user),
      taskPoints: (user.completedTasks || []).reduce((sum, task) => sum + task.points, 0),
      referralPoints: (user.referralCount || 0) * 150
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    const stats = {
      total_users: memoryDB.users.length,
      total_points: usersWithTotals.reduce((sum, user) => sum + user.totalPoints, 0),
      total_referrals: memoryDB.users.reduce((sum, user) => sum + (user.referralCount || 0), 0),
      total_completed_tasks: memoryDB.users.reduce((sum, user) => sum + (user.completedTasks || []).length, 0),
      users: usersWithTotals
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ... [REST OF YOUR ADMIN ENDPOINTS] ...

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy",
    server: "CRYPTA VPN",
    timestamp: new Date().toISOString(),
    users: memoryDB.users.length,
    uptime: process.uptime()
  });
});

// 🎯 ADMIN PAGE
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve main frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CRYPTA Server started on port ${PORT}`);
  console.log(`🌐 Dashboard: https://crypta-referal.onrender.com`);
  console.log(`👑 Admin Panel: https://crypta-referal.onrender.com/admin`);
  console.log(`📊 Registered users: ${memoryDB.users.length}`);
});
