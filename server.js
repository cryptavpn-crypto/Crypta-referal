import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000; // Render usa spesso porte diverse

// MongoDB URI
const MONGO_URI = "mongodb+srv://cryptavpn_db_user:zpW1ULdOntlv4uKN@crypta.fycuw0k.mongodb.net/crypta?retryWrites=true&w=majority";
let db;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connessione MongoDB con timeout
async function connectDB() {
  try {
    console.log('🔄 Tentativo di connessione a MongoDB...');
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });
    
    await client.connect();
    db = client.db();
    console.log('✅ Connesso a MongoDB');
    
    return true;
  } catch (error) {
    console.error('❌ Errore connessione MongoDB:', error.message);
    return false;
  }
}

// API Routes
app.post("/api/referral/user/register", async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: false, error: "Database non disponibile" });
    }

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
    if (!db) {
      return res.json({ success: false, error: "Database non disponibile" });
    }

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
    if (!db) {
      return res.json({ success: false, error: "Database non disponibile" });
    }

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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: db ? "healthy" : "database_error",
    database: db ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvio server
async function startServer() {
  console.log('🔄 Avvio server...');
  
  const dbConnected = await connectDB();
  
  if (!dbConnected) {
    console.log('⚠️  Server avviato senza database');
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server CRYPTA avviato su porta ${PORT}`);
    console.log(`📊 Database: ${dbConnected ? 'CONNESSO' : 'NON CONNESSO'}`);
  });
}

// Gestione errori non catturati
process.on('unhandledRejection', (err) => {
  console.error('❌ Errore non gestito:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Eccezione non catturata:', err);
});

startServer().catch(error => {
  console.error('❌ Errore avvio server:', error);
  process.exit(1);
});
