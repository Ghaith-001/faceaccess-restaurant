const express = require('express');
const router = express.Router();

const PYTHON_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:5001';

let _fetch;
async function getFetch() {
    if (!_fetch) _fetch = (await import('node-fetch')).default;
    return _fetch;
}

// GET /api/persons
router.get('/', async (req, res) => {
    try {
        const persons = await req.db.collection('persons')
            .find({})
            .sort({ enrolledAt: -1 })
            .toArray();
        res.json(persons);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/persons/:id  — toggle active
router.patch('/:id', async (req, res) => {
    try {
        const { active } = req.body;
        await req.db.collection('persons').updateOne(
            { personId: req.params.id },
            { $set: { active } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/persons/:id
router.delete('/:id', async (req, res) => {
    try {
        const personId = req.params.id;

        // Remove from Python DB — log failure but don't block the deletion
        try {
            const fetch = await getFetch();
            await fetch(`${PYTHON_URL}/delete/${personId}`, { method: 'DELETE', timeout: 5000 });
        } catch (e) {
            console.warn(`[Persons] Could not remove ${personId} from Python engine:`, e.message);
        }

        await req.db.collection('persons').deleteOne({ personId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
