import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Configurazione MongoDB - URI direttamente nel codice
const MONGO_URI = "mongodb+srv://cryptavpn_db_user:zpW1ULdOntlv4uKN@crypta.fycuw0k.mongodb.net/crypta?retryWrites=true&w=majority";
let db;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connessione MongoDB
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db();
    console.log('✅ Connesso a MongoDB');
  } catch (error) {
    console.error('❌ Errore connessione MongoDB:', error);
  }
}

// Routes API
app.post("/api/referral/user/register", async (req, res) => {
  try {
    const { username, referredBy } = req.body;

    if (!username) {
      return res.json({ success: false, error: "Username richiesto" });
    }

    // Verifica se l'utente esiste già
    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      return res.json({ success: true, user: existingUser });
    }

    // Genera codice referral unico
    const referralCode = generateReferralCode();
    
    // Crea nuovo utente
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

    // Se c'è un referral, aggiorna l'utente referrer
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

    // Verifica se il task è già completato
    const alreadyCompleted = user.completedTasks.some(task => task.taskId === taskId);
    if (alreadyCompleted) {
      return res.json({ success: false, error: "Task già completato" });
    }

    // Aggiorna l'utente
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
      ...user,
      rank: index + 1,
      referrals: user.referralCount || 0
    }));

    res.json({ success: true, leaderboard: rankedLeaderboard });
  } catch (error) {
    console.error('Errore leaderboard:', error);
    res.json({ success: false, error: "Errore interno del server" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "CRYPTA Server running" });
});

// Servi il file HTML per tutte le route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Funzione helper
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Avvio server
async function startServer() {
  await connectDB();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server CRYPTA avviato su porta ${PORT}`);
  });
}

startServer().catch(console.error);
