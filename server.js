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
      { id: 'twitter_follow', title: 'Segui CRYPTA VPN su X (Twitter)', points: 50 },
      { id: 'twitter_post', title: 'Posta e taggaci su X', points: 100 },
      { id: 'telegram_join', title: 'Unisciti al canale Telegram', points: 75 }
    ]
  };
}

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

function findUserByEmail(email) {
  return memoryDB.users.find(user => user.email === email);
}

function findUserByReferralCode(code) {
  return memoryDB.users.find(user => user.referralCode === code);
}

function isValidEmail(email) {
  return email && email.includes('@') && email.includes('.');
}

// 🔐 NUOVO ENDPOINT: Login utente esistente
app.post("/api/referral/user/login", async (req, res) => {
  try {
    const { username, email } = req.body;
    
    if (!username && !email) {
      return res.json({ success: false, error: "Inserisci username o email" });
    }

    let user;
    if (username) {
      user = findUserByUsername(username);
    } else if (email) {
      user = findUserByEmail(email);
    }

    if (!user) {
      return res.json({ success: false, error: "Utente non trovato" });
    }

    // Aggiorna ultima attività
    user.lastActive = new Date();
    saveData();

    console.log(`✅ Login effettuato: ${user.username}`);
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('Errore login:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// 📝 ENDPOINT: Registrazione (modificato)
app.post("/api/referral/user/register", async (req, res) => {
  try {
    const { username, email, telegram, referredBy } = req.body;
    
    if (!username || !email) {
      return res.json({ success: false, error: "Username e email richiesti" });
    }

    if (!isValidEmail(email)) {
      return res.json({ success: false, error: "Inserisci un'email valida" });
    }

    // Verifica se l'utente esiste già
    const existingUser = findUserByUsername(username) || findUserByEmail(email);
    if (existingUser) {
      return res.json({ 
        success: false, 
        error: "Utente già registrato",
        suggestion: "Usa la funzione di login" 
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
        referrer.points += 150;
        referrer.referrals.push({ username, email, joinedAt: new Date() });
        saveData();
      }
    }

    console.log(`✅ Nuovo utente: ${username} (${email})`);
    res.json({ success: true, user: newUser });
    
  } catch (error) {
    console.error('Errore registrazione:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// ✅ NUOVO ENDPOINT: Verifica automatica task completate
app.post("/api/referral/task/verify", async (req, res) => {
  try {
    const { username, taskId } = req.body;
    
    const user = findUserByUsername(username);
    if (!user) {
      return res.json({ success: false, error: "Utente non trovato" });
    }

    // Verifica se il task è già completato
    const alreadyCompleted = user.completedTasks.some(task => task.taskId === taskId);
    if (alreadyCompleted) {
      return res.json({ success: false, error: "Task già completata" });
    }

    // Trova il task per i punti
    const task = memoryDB.tasks.find(t => t.id === taskId);
    if (!task) {
      return res.json({ success: false, error: "Task non trovata" });
    }

    // 🔍 QUI ANDREBBE LA LOGICA DI VERIFICA REALE
    // Per ora simuliamo verifica positiva dopo 3 secondi
    setTimeout(() => {
      user.completedTasks.push({
        taskId,
        points: task.points,
        completedAt: new Date(),
        verified: true
      });
      user.points += task.points;
      user.lastActive = new Date();
      saveData();

      console.log(`✅ Task verificata: ${username} - ${taskId} (+${task.points} pts)`);
      res.json({ 
        success: true, 
        user,
        points: task.points,
        message: `Task completata! +${task.points} punti!` 
      });
    }, 3000);
    
  } catch (error) {
    console.error('Errore verifica task:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// ... [MANTIENI TUTTI GLI ALTRI ENDPOINT ESISTENTI] ...

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

// 🎯 PAGINA ADMIN
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve frontend principale
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvio server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server CRYPTA avviato su porta ${PORT}`);
  console.log(`🌐 Dashboard: https://crypta-referal.onrender.com`);
  console.log(`👑 Admin Panel: https://crypta-referal.onrender.com/admin`);
  console.log(`🔐 Nuovo: Sistema di login e verifica task automatica`);
  console.log(`📊 Utenti registrati: ${memoryDB.users.length}`);
});
