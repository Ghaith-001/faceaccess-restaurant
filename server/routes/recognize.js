const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = path.join(__dirname, '..', '..', 'uploads', 'logs');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename(req, file, cb) {
        cb(null, `${Date.now()}_access.jpg`);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const PYTHON_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:5001';

let _fetch;
async function getFetch() {
    if (!_fetch) _fetch = (await import('node-fetch')).default;
    return _fetch;
}

// POST /api/recognize  — called by ESP32-CAM
router.post('/', upload.single('image'), async (req, res) => {
    const db = req.db;
    if (!db) {
        // File was already saved by multer — clean it up
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(503).json({ error: 'DB indisponible' });
    }

    if (!req.file) return res.status(400).json({ error: 'Image requise' });

    const imagePath = req.file.path;
    let result;

    try {
        const fetch = await getFetch();
        const pyRes = await fetch(`${PYTHON_URL}/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath }),
            timeout: 10000
        });
        result = await pyRes.json();
    } catch (e) {
        fs.unlink(imagePath, () => {});
        return res.status(502).json({ error: 'Moteur Python inaccessible', detail: e.message });
    }

    const authorized = result.recognized === true;
    const personId = result.personId || null;
    const personName = result.person || 'INCONNU';
    const confidence = result.confidence || 0;

    // Check person is active (query by personId string field, not _id)
    let active = true;
    if (personId) {
        try {
            const person = await db.collection('persons').findOne({ personId });
            if (person && person.active === false) active = false;
        } catch {}
    }

    const finalAuthorized = authorized && active;

    const logEntry = {
        timestamp: new Date(),
        personId: personId || null,
        personName,
        authorized: finalAuthorized,
        confidence,
        capturedImagePath: `/uploads/logs/${path.basename(imagePath)}`,
        espMacAddress: req.headers['x-esp-mac'] || 'unknown'
    };

    await db.collection('access_logs').insertOne(logEntry);

    req.serverStats.recognitionCount++;
    if (finalAuthorized) req.serverStats.authorizedCount++;
    else req.serverStats.deniedCount++;

    req.broadcast({ type: 'access_event', data: { ...logEntry, _id: logEntry._id?.toString() } });

    console.log(`[Access] ${finalAuthorized ? 'AUTORISÉ' : 'REFUSÉ'} — ${personName} (${(confidence * 100).toFixed(0)}%)`);

    res.json({ authorized: finalAuthorized, person: personName, confidence });
});

module.exports = router;
