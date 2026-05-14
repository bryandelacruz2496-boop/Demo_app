const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const Student = require('../models/Student');
const { getCache, setCache, clearCache } = require('../middleware/cache');

const router = express.Router();

// Configure multer for student photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads');
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

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

// POST /api/student/logout
router.post('/logout', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const student = await Student.findById(decoded.id);
        if (student && student.activeToken === token) {
            student.activeToken = null;
            await student.save();
        }
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        res.json({ message: 'Logged out' });
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

// POST /api/student/profile-photo - Upload profile photo (student token required)
router.post('/profile-photo', upload.single('profileImage'), async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const student = await Student.findById(decoded.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        if (student.activeToken !== token) {
            return res.status(401).json({ message: 'Session expired' });
        }

        if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

        student.profileImage = `/uploads/${req.file.filename}`;
        await student.save();
        clearCache(`student_${decoded.id}`);

        res.json({ message: 'Profile photo updated', profileImage: student.profileImage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
