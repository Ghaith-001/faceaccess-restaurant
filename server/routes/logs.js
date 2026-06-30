const express = require('express');
const router = express.Router();

// GET /api/logs?limit=50&page=1&authorized=true&personName=Jean
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.authorized !== undefined && req.query.authorized !== '')
            filter.authorized = req.query.authorized === 'true';
        if (req.query.personName) filter.personName = { $regex: req.query.personName, $options: 'i' };
        if (req.query.from || req.query.to) {
            filter.timestamp = {};
            if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
            if (req.query.to)   filter.timestamp.$lte = new Date(req.query.to);
        }

        const [logs, total] = await Promise.all([
            req.db.collection('access_logs').find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
            req.db.collection('access_logs').countDocuments(filter)
        ]);

        res.json({ logs, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/logs  — clear all
router.delete('/', async (req, res) => {
    try {
        const result = await req.db.collection('access_logs').deleteMany({});
        res.json({ deleted: result.deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
