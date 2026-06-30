const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ObjectId } = require('mongodb');

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = path.join(__dirname, '..', '..', 'uploads', 'enrollment', req.enrollDir || 'tmp');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const PYTHON_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:5001';

let _fetch;
async function getFetch() {
    if (!_fetch) _fetch = (await import('node-fetch')).default;
    return _fetch;
}

function cleanupDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// POST /api/enroll — called by mobile app
router.post('/', (req, res, next) => {
    req.enrollDir = new ObjectId().toHexString();
    next();
}, upload.array('photos', 25), async (req, res) => {
    const db = req.db;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const { name, role } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    if (!req.files || req.files.length < 3)
        return res.status(400).json({ error: 'Minimum 3 photos requises' });

    const personId = req.enrollDir;
    const enrollDir = path.join(__dirname, '..', '..', 'uploads', 'enrollment', personId);
    const imagePaths = req.files.map(f => f.path);

    let pyResult;
    try {
        const fetch = await getFetch();
        const pyRes = await fetch(`${PYTHON_URL}/encode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId, name, imagePaths }),
            timeout: 30000
        });
        pyResult = await pyRes.json();
    } catch (e) {
        cleanupDir(enrollDir);
        return res.status(502).json({ error: 'Moteur Python inaccessible', detail: e.message });
    }

    if (!pyResult.success) {
        cleanupDir(enrollDir);
        return res.status(422).json({ error: pyResult.error || 'Encodage échoué' });
    }

    // Copy first photo as profile picture
    const profileDest = path.join(__dirname, '..', '..', 'uploads', 'persons', `${personId}.jpg`);
    fs.mkdirSync(path.dirname(profileDest), { recursive: true });
    fs.copyFileSync(imagePaths[0], profileDest);

    const personDoc = {
        _id: new ObjectId(personId),
        personId,
        name,
        role: role || 'client',
        enrolledAt: new Date(),
        active: true,
        photoUrl: `/uploads/persons/${personId}.jpg`,
        samplesUsed: pyResult.samplesUsed
    };

    await db.collection('persons').insertOne(personDoc);

    console.log(`[Enroll] ${name} (${role}) enrolled with ${pyResult.samplesUsed} samples`);
    res.json({ success: true, personId, samplesUsed: pyResult.samplesUsed });
});

module.exports = router;
