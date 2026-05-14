const express = require('express');
const GlobalProject = require('../models/GlobalProject');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/projects - Get all projects (public)
router.get('/', async (req, res) => {
    try {
        const { grade } = req.query;
        let filter = {};
        if (grade) {
            filter = { $or: [{ targetGrade: 'all' }, { targetGrade: { $regex: new RegExp(grade, 'i') } }] };
        }
        const projects = await GlobalProject.find(filter).sort({ dueDate: 1 });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/projects - Create project (admin only)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, subject, dueDate, description, targetGrade } = req.body;
        const project = new GlobalProject({
            title, subject, dueDate, description,
            targetGrade: targetGrade || 'all',
            createdBy: req.admin.username
        });
        await project.save();
        res.status(201).json({ message: 'Project created', project });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/projects/:id - Delete project (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await GlobalProject.findByIdAndDelete(req.params.id);
        res.json({ message: 'Project deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
