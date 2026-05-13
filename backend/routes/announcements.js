const express = require('express');
const Announcement = require('../models/Announcement');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/announcements - Get all announcements (optionally filter by grade)
router.get('/', async (req, res) => {
    try {
        const { grade } = req.query;

        // Mark announcements older than 20 hours as done
        const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
        await Announcement.updateMany(
            { status: 'active', createdAt: { $lt: twentyHoursAgo } },
            { $set: { status: 'done' } }
        );

        let filter = { status: 'active' };
        if (grade) {
            filter = {
                status: 'active',
                $or: [
                    { targetGrade: 'all' },
                    { targetGrade: { $regex: new RegExp(grade, 'i') } }
                ]
            };
        }
        const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/announcements - Create announcement (admin only)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { subject, body, targetGrade } = req.body;
        const announcement = new Announcement({
            subject,
            body,
            targetGrade: targetGrade || 'all',
            createdBy: req.admin.username
        });
        await announcement.save();
        res.status(201).json({ message: 'Announcement created', announcement });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/announcements/:id - Delete announcement (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        res.json({ message: 'Announcement deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
