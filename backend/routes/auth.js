const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');
const { logAction } = require('../middleware/auditLogger');
const { passwordPolicyMiddleware } = require('../middleware/passwordPolicy');

const router = express.Router();

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 minutes for access token
};

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days for refresh token
};

// Generate tokens
function generateAccessToken(admin) {
    return jwt.sign(
        { id: admin._id, username: admin.username, role: admin.role, name: admin.name },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

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

        const accessToken = generateAccessToken(admin);
        const refreshToken = generateRefreshToken();

        // Store refresh token in DB
        admin.refreshToken = refreshToken;
        await admin.save();

        logAction('ADMIN_LOGIN', admin.username, 'Admin logged in', null, req.ip);

        // Set httpOnly cookies
        res.cookie('accessToken', accessToken, COOKIE_OPTIONS);
        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

        res.json({
            token: accessToken, // Also send in body for backward compatibility
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

// POST /api/auth/refresh - Token refresh rotation
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'No refresh token' });
        }

        // Find admin with this refresh token
        const admin = await Admin.findOne({ refreshToken });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Generate new token pair (rotation)
        const newAccessToken = generateAccessToken(admin);
        const newRefreshToken = generateRefreshToken();

        // Update refresh token in DB (invalidates old one)
        admin.refreshToken = newRefreshToken;
        await admin.save();

        // Set new cookies
        res.cookie('accessToken', newAccessToken, COOKIE_OPTIONS);
        res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);

        res.json({ token: newAccessToken });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const admin = await Admin.findOne({ refreshToken });
            if (admin) {
                admin.refreshToken = null;
                await admin.save();
            }
        }

        res.clearCookie('accessToken');
        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.id).select('-password -refreshToken');
        res.json(admin);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/register (admin only - requires existing admin auth + password policy)
router.post('/register', authMiddleware, passwordPolicyMiddleware, async (req, res) => {
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
