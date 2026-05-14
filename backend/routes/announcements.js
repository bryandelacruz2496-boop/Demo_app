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

        // Send push notification
        const sendPushToAll = req.app.get('sendPushToAll');
        if (sendPushToAll) {
            sendPushToAll('📢 New Announcement', subject);
        }

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

// POST /api/announcements/:id/replies - Add reply (admin)
router.post('/:id/replies', authMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ message: 'Message is required' });

        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

        announcement.replies.push({
            author: req.admin.name || req.admin.username,
            role: 'admin',
            message
        });
        await announcement.save();
        res.json({ replies: announcement.replies });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/announcements/:id/student-reply - Add reply (student)
router.post('/:id/student-reply', async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const Student = require('../models/Student');
        const student = await Student.findById(decoded.id);
        if (!student) return res.status(401).json({ message: 'Invalid token' });

        const { message } = req.body;
        if (!message) return res.status(400).json({ message: 'Message is required' });

        // Rate limit: 3 replies per minute per student
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const allAnnouncements = await Announcement.find({ status: 'active' });
        let recentReplies = 0;
        allAnnouncements.forEach(a => {
            (a.replies || []).forEach(r => {
                if (r.author === student.fullName && r.role === 'student' && new Date(r.createdAt) > oneMinuteAgo) {
                    recentReplies++;
                }
            });
        });
        if (recentReplies >= 3) {
            return res.status(429).json({ message: 'You can only send 3 replies per minute. Please wait.' });
        }

        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

        announcement.replies.push({
            author: student.fullName,
            role: 'student',
            message
        });
        await announcement.save();
        res.json({ replies: announcement.replies });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
