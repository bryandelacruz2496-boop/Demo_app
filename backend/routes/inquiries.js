const express = require('express');
const Inquiry = require('../models/Inquiry');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/inquiries - Disabled
router.post('/', (req, res) => {
    res.status(403).json({ message: 'Inquiry submissions are currently disabled.' });
});

// GET /api/inquiries - Get all inquiries (admin only)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const inquiries = await Inquiry.find().sort({ createdAt: -1 });
        res.json(inquiries);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/inquiries/:id/status - Update inquiry status (admin only)
router.put('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json(inquiry);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/inquiries/:id - Delete inquiry (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await Inquiry.findByIdAndDelete(req.params.id);
        res.json({ message: 'Inquiry deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
