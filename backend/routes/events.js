const express = require('express');
const SchoolEvent = require('../models/SchoolEvent');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/events - Public: list upcoming events
router.get('/', async (req, res) => {
    try {
        const events = await SchoolEvent.find({}).sort({ date: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/events - Admin only: create event
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, date, type, description } = req.body;
        if (!title || !date || !type) {
            return res.status(400).json({ message: 'Title, date, and type are required' });
        }
        const event = new SchoolEvent({ title, date, type, description });
        await event.save();
        res.status(201).json(event);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/events/:id - Admin only: delete event
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await SchoolEvent.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
