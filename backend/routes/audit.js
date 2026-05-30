const express = require('express');
const AuditLog = require('../models/AuditLog');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/audit - Get audit logs (admin only)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/audit/actions - Get all distinct action types
router.get('/actions', authMiddleware, async (req, res) => {
    try {
        const actions = await AuditLog.distinct('action');
        res.json(actions.sort());
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
