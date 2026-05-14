const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');
const { logAction } = require('../middleware/auditLogger');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin._id, username: admin.username, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        logAction('ADMIN_LOGIN', admin.username, 'Admin logged in', null, req.ip);

        res.json({
            token,
            admin: {
                id: admin._id,
                username: admin.username,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.id).select('-password');
        res.json(admin);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/register (for initial setup only)
router.post('/register', async (req, res) => {
    try {
        const { username, password, name } = req.body;

        const existing = await Admin.findOne({ username });
        if (existing) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const admin = new Admin({ username, password, name });
        await admin.save();

        res.status(201).json({ message: 'Admin created successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
