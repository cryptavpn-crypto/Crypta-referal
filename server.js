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
  
  // Dati iniziali
  return {
    users: [],
    tasks: [
      { id: 'twitter_follow', title: 'Segui CRYPTA VPN su X (Twitter)', points: 50 },
      { id: 'twitter_post', title: 'Posta e taggaci su X', points: 100 },
      { id: 'telegram_join', title: 'Unisciti al canale Telegram', points: 75 }
    ]
  };
}

// Salva dati
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryDB, null, 2));
    console.log('💾 Dati salvati su file');
  } catch (error) {
    console.error('Errore salvataggio dati:', error);
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

function findUserByReferralCode(code) {
  return memoryDB.users.find(user => user.referralCode === code);
}

// API Routes
app.post("/api/referral/user/register", async (req, res) => {
  try {
    const { username, referredBy } = req.body;
    
    if (!username) {
      return res.json({ success: false, error: "Username richiesto" });
    }

    const existingUser = findUserByUsername(username);
    if (existingUser) {
      return res.json({ success: true, user: existingUser });
    }

    const referralCode = generateReferralCode();
    const newUser = {
      username,
      referralCode,
      points: 0,
      referralCount: 0,
      completedTasks: [],
      referredBy: referredBy || null,
      createdAt: new Date()
    };

    memoryDB.users.push(newUser);
    saveData(); // SALVA I DATI

    if (referredBy) {
      const referrer = findUserByReferralCode(referredBy);
      if (referrer) {
        referrer.referralCount += 1;
        referrer.points += 150;
        if (!referrer.referrals) referrer.referrals = [];
        referrer.referrals.push({ username, joinedAt: new Date() });
        saveData(); // SALVA I DATI
      }
    }

    console.log(`✅ Nuovo utente: ${username}`);
    res.json({ success: true, user: newUser });
    
  } catch (error) {
    console.error('Errore registrazione:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

app.post("/api/referral/task/complete", async (req, res) => {
  try {
    const { username, taskId, points } = req.body;
    
    const user = findUserByUsername(username);
    if (!user) {
      return res.json({ success: false, error: "Utente non trovato" });
    }

    const alreadyCompleted = user.completedTasks.some(task => task.taskId === taskId);
    if (alreadyCompleted) {
      return res.json({ success: false, error: "Task già completato" });
    }

    user.completedTasks.push({
      taskId,
      points,
      completedAt: new Date()
    });
    user.points += points;
    
    saveData(); // SALVA I DATI

    console.log(`✅ Task completato: ${username} - ${taskId}`);
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('Errore completamento task:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

app.get("/api/referral/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const leaderboard = [...memoryDB.users]
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((user, index) => ({
        username: user.username,
        points: user.points,
        referralCount: user.referralCount,
        rank: index + 1
      }));

    res.json({ success: true, leaderboard });
    
  } catch (error) {
    console.error('Errore leaderboard:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// 🔍 **NUOVO ENDPOINT: Visualizza tutti i dati**
app.get("/api/admin/data", (req, res) => {
  try {
    const stats = {
      total_users: memoryDB.users.length,
      total_points: memoryDB.users.reduce((sum, user) => sum + user.points, 0),
      total_referrals: memoryDB.users.reduce((sum, user) => sum + user.referralCount, 0),
      users: memoryDB.users.map(user => ({
        username: user.username,
        referralCode: user.referralCode,
        points: user.points,
        referralCount: user.referralCount,
        completedTasks: user.completedTasks.length,
        referredBy: user.referredBy,
        createdAt: user.createdAt
      }))
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 🔍 **NUOVO ENDPOINT: Download dati completi**
app.get("/api/admin/export", (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="crypta-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(memoryDB, null, 2));
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy",
    database: "json_file",
    users_count: memoryDB.users.length,
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvio server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server CRYPTA avviato su porta ${PORT}`);
  console.log(`🌐 URL: https://crypta-referal.onrender.com`);
  console.log(`💾 Database: JSON File (${memoryDB.users.length} utenti)`);
  console.log('📊 Per vedere i dati visita: /api/admin/data');
  console.log('💾 Per scaricare i dati: /api/admin/export');
});
