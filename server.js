import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB URI
const MONGO_URI = "mongodb+srv://cryptavpn_db_user:zpW1ULdOntlv4uKN@crypta.fycuw0k.mongodb.net/crypta?retryWrites=true&w=majority";
let db = null;
let client = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connessione MongoDB con ritry
async function connectDB() {
  try {
    console.log('🔄 Tentativo di connessione a MongoDB...');
    
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    });
    
    await client.connect();
    db = client.db();
    console.log('✅ Connesso a MongoDB');
    
    // Test della connessione
    await db.command({ ping: 1 });
    console.log('✅ Ping MongoDB riuscito');
    
    return true;
  } catch (error) {
    console.error('❌ Errore connessione MongoDB:', error.message);
    
    // Dettagli aggiuntivi per debug
    if (error.name === 'MongoServerSelectionError') {
      console.error('🔍 Problema di rete/whitelist IP');
    } else if (error.name === 'MongoAuthenticationError') {
      console.error('🔍 Problema di autenticazione');
    }
    
    return false;
  }
}

// Middleware per verificare il database
app.use('/api/referral', (req, res, next) => {
  if (!db) {
    return res.json({ 
      success: false, 
      error: "Database temporaneamente non disponibile. Riprova tra qualche secondo." 
    });
  }
  next();
});

// API Routes
app.post("/api/referral/user/register", async (req, res) => {
  try {
    const { username, referredBy } = req.body;
    if (!username) {
      return res.json({ success: false, error: "Username richiesto" });
    }

    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      return res.json({ success: true, user: existingUser });
    }

    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newUser = {
      username,
      referralCode,
      points: 0,
      referralCount: 0,
      completedTasks: [],
      referredBy: referredBy || null,
      createdAt: new Date()
    };

    await db.collection('users').insertOne(newUser);

    if (referredBy) {
      const referrer = await db.collection('users').findOne({ referralCode: referredBy });
      if (referrer) {
        await db.collection('users').updateOne(
          { referralCode: referredBy },
          { 
            $inc: { referralCount: 1, points: 150 },
            $push: { referrals: { username, joinedAt: new Date() } }
          }
        );
      }
    }

    res.json({ success: true, user: newUser });
  } catch (error) {
    console.error('Errore registrazione:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

app.post("/api/referral/task/complete", async (req, res) => {
  try {
    const { username, taskId, points } = req.body;
    const user = await db.collection('users').findOne({ username });
    
    if (!user) {
      return res.json({ success: false, error: "Utente non trovato" });
    }

    const alreadyCompleted = user.completedTasks.some(task => task.taskId === taskId);
    if (alreadyCompleted) {
      return res.json({ success: false, error: "Task già completato" });
    }

    const updatedUser = await db.collection('users').findOneAndUpdate(
      { username },
      {
        $push: { 
          completedTasks: { 
            taskId, 
            points,
            completedAt: new Date()
          } 
        },
        $inc: { points: points }
      },
      { returnDocument: 'after' }
    );

    res.json({ success: true, user: updatedUser.value });
  } catch (error) {
    console.error('Errore completamento task:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

app.get("/api/referral/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = await db.collection('users')
      .find({})
      .sort({ points: -1 })
      .limit(limit)
      .toArray();

    const rankedLeaderboard = leaderboard.map((user, index) => ({
      username: user.username,
      points: user.points || 0,
      referralCount: user.referralCount || 0,
      rank: index + 1
    }));

    res.json({ success: true, leaderboard: rankedLeaderboard });
  } catch (error) {
    console.error('Errore leaderboard:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// Health check migliorato
app.get("/api/health", async (req, res) => {
  try {
    if (db) {
      await db.command({ ping: 1 });
      res.json({ 
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({ 
        status: "degraded",
        database: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.json({ 
      status: "error",
      database: "connection_failed",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Riconnessione automatica
async function initializeDatabase() {
  let connected = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!connected && attempts < maxAttempts) {
    attempts++;
    console.log(`🔄 Tentativo di connessione ${attempts}/${maxAttempts}...`);
    
    connected = await connectDB();
    
    if (!connected) {
      console.log(`⏳ Attesa 5 secondi prima del prossimo tentativo...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (!connected) {
    console.log('❌ Impossibile connettersi a MongoDB dopo tutti i tentativi');
  }
}

// Avvio server
async function startServer() {
  console.log('🔄 Avvio server CRYPTA...');
  
  // Avvia il server anche senza DB
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server CRYPTA avviato su porta ${PORT}`);
    console.log(`🌐 URL: https://crypta-referal.onrender.com`);
  });
  
  // Prova a connettere il DB in background
  initializeDatabase().then(() => {
    if (db) {
      console.log('🎉 Database connesso con successo!');
    }
  });
}

startServer().catch(error => {
  console.error('❌ Errore avvio server:', error);
  process.exit(1);
});
