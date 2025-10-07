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
    console.error('Error loading data:', error);
  }
  
  return {
    users: [],
    pendingVerifications: [],
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

    console.log(`✅ User logged in: ${user.username} (${user.email})`);
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
      pendingTasks: [],
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

    console.log(`✅ New user registered: ${username} (${email})`);
    res.json({ success: true, user: newUser });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// ✅ SUBMIT TASK FOR MANUAL VERIFICATION (100% REAL)
app.post("/api/referral/task/submit", async (req, res) => {
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

    // Check if task is already pending
    const alreadyPending = user.pendingTasks.some(task => task.taskId === taskId);
    if (alreadyPending) {
      return res.json({ success: false, error: "Task already submitted for verification" });
    }

    // Find the task for points
    const task = memoryDB.tasks.find(t => t.id === taskId);
    if (!task) {
      return res.json({ success: false, error: "Task not found" });
    }

    // Add to pending tasks
    if (!user.pendingTasks) user.pendingTasks = [];
    user.pendingTasks.push({
      taskId,
      points: task.points,
      submittedAt: new Date(),
      status: 'pending'
    });

    // Add to global pending verifications for admin
    memoryDB.pendingVerifications.push({
      username: user.username,
      email: user.email,
      taskId,
      taskTitle: task.title,
      points: task.points,
      submittedAt: new Date(),
      status: 'pending'
    });

    user.lastActive = new Date();
    saveData();

    console.log(`📋 Task submitted for manual verification: ${username} - ${taskId}`);
    console.log(`📧 User email: ${user.email}`);
    
    res.json({ 
      success: true, 
      user,
      message: "Task submitted for manual verification. Admin will review and award points." 
    });
    
  } catch (error) {
    console.error('Task submission error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 👑 ADMIN: Approve task manually
app.post("/api/admin/approve-task", async (req, res) => {
  try {
    const { username, taskId } = req.body;
    
    const user = findUserByUsername(username);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    // Find pending task
    const pendingTaskIndex = user.pendingTasks.findIndex(task => task.taskId === taskId);
    if (pendingTaskIndex === -1) {
      return res.json({ success: false, error: "No pending task found" });
    }

    const pendingTask = user.pendingTasks[pendingTaskIndex];
    
    // Move to completed tasks
    user.completedTasks.push({
      taskId: pendingTask.taskId,
      points: pendingTask.points,
      completedAt: new Date(),
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: 'admin',
      verificationMethod: 'manual'
    });

    // Remove from pending
    user.pendingTasks.splice(pendingTaskIndex, 1);

    // Remove from global pending verifications
    memoryDB.pendingVerifications = memoryDB.pendingVerifications.filter(
      verification => !(verification.username === username && verification.taskId === taskId)
    );

    // Update total points
    user.totalPoints = calculateTotalPoints(user);
    saveData();

    console.log(`✅ Task approved by admin: ${username} - ${taskId} (+${pendingTask.points} pts)`);
    
    res.json({ 
      success: true, 
      message: `Task approved! ${username} received ${pendingTask.points} points.`,
      user 
    });
    
  } catch (error) {
    console.error('Task approval error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 👑 ADMIN: Reject task
app.post("/api/admin/reject-task", async (req, res) => {
  try {
    const { username, taskId, reason } = req.body;
    
    const user = findUserByUsername(username);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    // Remove from pending tasks
    user.pendingTasks = user.pendingTasks.filter(task => task.taskId !== taskId);

    // Remove from global pending verifications
    memoryDB.pendingVerifications = memoryDB.pendingVerifications.filter(
      verification => !(verification.username === username && verification.taskId === taskId)
    );

    saveData();

    console.log(`❌ Task rejected by admin: ${username} - ${taskId}. Reason: ${reason}`);
    
    res.json({ 
      success: true, 
      message: `Task rejected. User notified.` 
    });
    
  } catch (error) {
    console.error('Task rejection error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 📊 Leaderboard with REAL data and emails
app.get("/api/referral/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Calculate total points for all users and sort
    const leaderboard = memoryDB.users
      .map(user => ({
        username: user.username,
        email: user.email,
        points: calculateTotalPoints(user),
        referralCount: user.referralCount || 0,
        completedTasks: (user.completedTasks || []).length,
        joinedAt: user.createdAt
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((user, index) => ({
        ...user,
        rank: index + 1
      }));

    res.json({ success: true, leaderboard });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ success: false, error: "Internal server error" });
  }
});

// 🔍 ADMIN: Get all data with emails and pending verifications
app.get("/api/admin/data", (req, res) => {
  try {
    const usersWithTotals = memoryDB.users.map(user => ({
      username: user.username,
      email: user.email,
      telegram: user.telegram,
      referralCode: user.referralCode,
      totalPoints: calculateTotalPoints(user),
      taskPoints: (user.completedTasks || []).reduce((sum, task) => sum + task.points, 0),
      referralPoints: (user.referralCount || 0) * 150,
      referralCount: user.referralCount || 0,
      completedTasks: user.completedTasks || [],
      pendingTasks: user.pendingTasks || [],
      referrals: user.referrals || [],
      referredBy: user.referredBy,
      createdAt: user.createdAt,
      lastActive: user.lastActive
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    const stats = {
      total_users: memoryDB.users.length,
      total_points: usersWithTotals.reduce((sum, user) => sum + user.totalPoints, 0),
      total_referrals: memoryDB.users.reduce((sum, user) => sum + (user.referralCount || 0), 0),
      total_completed_tasks: memoryDB.users.reduce((sum, user) => sum + (user.completedTasks || []).length, 0),
      pending_verifications: memoryDB.pendingVerifications.length,
      users: usersWithTotals,
      pendingVerifications: memoryDB.pendingVerifications
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 👑 ADMIN: Get pending verifications
app.get("/api/admin/pending-verifications", (req, res) => {
  try {
    res.json({ success: true, pendingVerifications: memoryDB.pendingVerifications });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy",
    server: "CRYPTA VPN",
    timestamp: new Date().toISOString(),
    users: memoryDB.users.length,
    pending_verifications: memoryDB.pendingVerifications.length,
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
  console.log(`✅ 100% REAL manual verification system enabled`);
  console.log(`📧 User emails are fully visible in admin panel`);
  console.log(`📊 Registered users: ${memoryDB.users.length}`);
});
