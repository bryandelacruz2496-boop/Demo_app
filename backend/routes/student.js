const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const Student = require('../models/Student');
const { getCache, setCache, clearCache } = require('../middleware/cache');
const { cloudinary, upload, uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

// POST /api/student/login
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

        const accessToken = jwt.sign(
            { id: student._id, studentNo: student.studentNo },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        const crypto = require('crypto');
        const refreshToken = crypto.randomBytes(40).toString('hex');

        // Save tokens - invalidates any previous session
        student.activeToken = accessToken;
        student.refreshToken = refreshToken;
        await student.save();

        // Set httpOnly cookies
        res.cookie('studentAccessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        res.cookie('studentRefreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/student/refresh-token',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Calculate total paid
        const totalPaid = student.payments
            .filter(p => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0);

        res.json({
            token: accessToken, // backward compatibility
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
                assessments: student.assessments,
                notifications: student.notifications || []
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
        const token = req.cookies?.studentAccessToken || req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const student = await Student.findById(decoded.id);
        if (student) {
            student.activeToken = null;
            student.refreshToken = null;
            await student.save();
        }

        res.clearCookie('studentAccessToken');
        res.clearCookie('studentRefreshToken', { path: '/api/student/refresh-token' });
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        res.json({ message: 'Logged out' });
    }
});

// POST /api/student/refresh-token - Token refresh rotation
router.post('/refresh-token', async (req, res) => {
    try {
        const refreshToken = req.cookies?.studentRefreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'No refresh token' });
        }

        const student = await Student.findOne({ refreshToken });
        if (!student) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Generate new token pair
        const newAccessToken = jwt.sign(
            { id: student._id, studentNo: student.studentNo },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
        const crypto = require('crypto');
        const newRefreshToken = crypto.randomBytes(40).toString('hex');

        // Rotate tokens
        student.activeToken = newAccessToken;
        student.refreshToken = newRefreshToken;
        await student.save();

        res.cookie('studentAccessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        res.cookie('studentRefreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/student/refresh-token',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ token: newAccessToken });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/student/refresh - Get fresh student data using token
router.get('/refresh', async (req, res) => {
    try {
        const token = req.cookies?.studentAccessToken || req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const student = await Student.findById(decoded.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        // Check if this token is still the active session
        if (student.activeToken !== token) {
            return res.status(401).json({ message: 'Session expired. You have been logged in on another device.' });
        }

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
            assessments: student.assessments,
            notifications: student.notifications || []
        };

        res.json({ student: studentData });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// PUT /api/student/notifications/read - Mark all notifications as read
router.put('/notifications/read', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const student = await Student.findById(decoded.id);
        if (!student) return res.status(404).json({ message: 'Not found' });
        student.notifications.forEach(n => n.read = true);
        await student.save();
        res.json({ message: 'All marked as read' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
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

        // Delete old image from Cloudinary if exists
        if (student.profileImage && student.profileImage.includes('cloudinary')) {
            const parts = student.profileImage.split('/');
            const folderAndFile = parts.slice(parts.indexOf('beatasai')).join('/').split('.')[0];
            await cloudinary.uploader.destroy(folderAndFile).catch(() => { });
        }

        const result = await uploadToCloudinary(req.file.buffer);
        student.profileImage = result.secure_url;
        await student.save();
        clearCache(`student_${decoded.id}`);

        res.json({ message: 'Profile photo updated', profileImage: student.profileImage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
