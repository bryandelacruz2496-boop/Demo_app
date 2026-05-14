const express = require('express');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const { getCache, setCache } = require('../middleware/cache');

const router = express.Router();

// POST /api/student/login
router.post('/login', async (req, res) => {
    try {
        const { studentNo, password } = req.body;

        const student = await Student.findOne({ studentNo });
        if (!student) {
            return res.status(401).json({ message: 'Invalid student number or password' });
        }

        const isMatch = await student.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid student number or password' });
        }

        const token = jwt.sign(
            { id: student._id, studentNo: student.studentNo },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Save active token - invalidates any previous session
        student.activeToken = token;
        await student.save();

        // Calculate total paid
        const totalPaid = student.payments
            .filter(p => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0);

        res.json({
            token,
            student: {
                fullName: student.fullName,
                studentNo: student.studentNo,
                grade: student.grade,
                guardian: student.guardian,
                profileImage: student.profileImage,
                totalTuition: student.totalTuition,
                totalPaid,
                payments: student.payments,
                activities: student.activities,
                projects: student.projects,
                assessments: student.assessments
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/student/refresh - Get fresh student data using token
router.get('/refresh', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const student = await Student.findById(decoded.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        // Check if this token is still the active session
        if (student.activeToken !== token) {
            return res.status(401).json({ message: 'Session expired. You have been logged in on another device.' });
        }

        // Check cache (30 second TTL)
        const cacheKey = `student_${decoded.id}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ student: cached });

        const totalPaid = student.payments
            .filter(p => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0);

        const studentData = {
            fullName: student.fullName,
            studentNo: student.studentNo,
            grade: student.grade,
            guardian: student.guardian,
            profileImage: student.profileImage,
            totalTuition: student.totalTuition,
            totalPaid,
            payments: student.payments,
            activities: student.activities,
            projects: student.projects,
            assessments: student.assessments
        };

        setCache(cacheKey, studentData, 30);
        res.json({ student: studentData });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

module.exports = router;
