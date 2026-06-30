const express = require('express');
const { MongoClient } = require('mongodb');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// Cache node-fetch (ESM module) to avoid re-importing on every request
let _fetch;
async function getFetch() {
    if (!_fetch) _fetch = (await import('node-fetch')).default;
    return _fetch;
}

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'restaurant_access';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

let db;
const activeClients = new Set();

const serverStats = {
    startTime: new Date(),
    recognitionCount: 0,
    authorizedCount: 0,
    deniedCount: 0,
    pythonOnline: false,
    dbConnected: false
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Auth helpers ───────────────────────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = user;
        next();
    });
}

// ── WebSocket ──────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    try { jwt.verify(token, JWT_SECRET); } catch { ws.close(1008, 'Non autorisé'); return; }
    activeClients.add(ws);
    ws.on('close', () => activeClients.delete(ws));
    ws.on('error', () => activeClients.delete(ws));
    broadcastStatus();
});

function broadcast(data) {
    const msg = JSON.stringify(data);
    activeClients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(msg);
        else activeClients.delete(c);
    });
}

function broadcastStatus() {
    broadcast({
        type: 'server_status',
        status: {
            dbConnected: serverStats.dbConnected,
            pythonOnline: serverStats.pythonOnline,
            recognitionCount: serverStats.recognitionCount,
            uptime: Math.floor((Date.now() - serverStats.startTime) / 1000),
            serverTime: new Date().toISOString()
        }
    });
}

// ── Python engine check ────────────────────────────────────────────────────────
const PYTHON_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:5001';

async function checkPythonEngine() {
    try {
        const fetch = await getFetch();
        const r = await fetch(`${PYTHON_URL}/health`, { timeout: 3000 });
        serverStats.pythonOnline = r.ok;
    } catch {
        serverStats.pythonOnline = false;
    }
}

// ── Routes ─────────────────────────────────────────────────────────────────────
const recognizeRouter = require('./routes/recognize');
const enrollRouter = require('./routes/enroll');
const personsRouter = require('./routes/persons');
const logsRouter = require('./routes/logs');

app.use('/api/recognize', (req, res, next) => { req.db = db; req.serverStats = serverStats; req.broadcast = broadcast; next(); }, recognizeRouter);
app.use('/api/enroll', (req, res, next) => { req.db = db; req.uploadDir = 'enrollment'; next(); }, enrollRouter);
app.use('/api/persons', (req, res, next) => { req.db = db; next(); }, authenticateToken, personsRouter);
app.use('/api/logs', (req, res, next) => { req.db = db; next(); }, authenticateToken, logsRouter);

// ── Auth ───────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Champs requis' });
        if (!db) return res.status(503).json({ error: 'DB indisponible' });

        const user = await db.collection('users').findOne({ username });
        if (!user || !await bcrypt.compare(password, user.password))
            return res.status(401).json({ error: 'Identifiants incorrects' });

        await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { username: user.username, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Stats (protected) ──────────────────────────────────────────────────────────
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'DB indisponible' });
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [total, authorized, denied, todayTotal, personsCount] = await Promise.all([
            db.collection('access_logs').countDocuments({}),
            db.collection('access_logs').countDocuments({ authorized: true }),
            db.collection('access_logs').countDocuments({ authorized: false }),
            db.collection('access_logs').countDocuments({ timestamp: { $gte: today } }),
            db.collection('persons').countDocuments({ active: true })
        ]);
        res.json({ total, authorized, denied, todayTotal, personsCount, pythonOnline: serverStats.pythonOnline });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Health (public) ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
    status: 'ok',
    dbConnected: serverStats.dbConnected,
    pythonOnline: serverStats.pythonOnline,
    uptime: Math.floor((Date.now() - serverStats.startTime) / 1000),
    serverTime: new Date().toISOString()
}));

app.get('/', (req, res) => res.redirect('/login.html'));

// ── MongoDB ────────────────────────────────────────────────────────────────────
async function connectMongoDB() {
    try {
        const client = await MongoClient.connect(MONGODB_URI, { maxPoolSize: 5 });
        db = client.db(DB_NAME);

        await db.collection('persons').createIndexes([{ key: { active: 1 } }]);
        await db.collection('access_logs').createIndexes([
            { key: { timestamp: -1 } },
            { key: { authorized: 1, timestamp: -1 } },
            { key: { personId: 1 } }
        ]);

        // Seed admin user
        const usersCol = db.collection('users');
        if (!await usersCol.findOne({ username: 'admin' })) {
            await usersCol.insertOne({
                username: 'admin',
                password: await bcrypt.hash('admin123', 10),
                role: 'admin',
                createdAt: new Date()
            });
            console.log('Admin créé: admin / admin123');
        }

        serverStats.dbConnected = true;
        console.log('MongoDB connecté');
        broadcastStatus();
    } catch (e) {
        console.error('MongoDB erreur:', e.message);
        setTimeout(connectMongoDB, 5000);
    }
}

// ── Start ──────────────────────────────────────────────────────────────────────
async function startServer() {
    await connectMongoDB();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('═══════════════════════════════════════');
        console.log(`  FaceAccess Restaurant v1.0`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`  Credentials: admin / admin123`);
        console.log('═══════════════════════════════════════');
    });

    server.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    });

    // Periodic checks
    setInterval(() => { checkPythonEngine(); broadcastStatus(); }, 15000);
    checkPythonEngine();

    process.on('SIGINT', () => { console.log('\nArrêt...'); process.exit(0); });
    process.on('SIGTERM', () => process.exit(0));
}

startServer();
