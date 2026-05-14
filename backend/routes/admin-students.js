const express = require('express');
const multer = require('multer');
const path = require('path');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const { TUITION_TABLE, generatePayments } = require('../config/tuition');
const { clearCache } = require('../middleware/cache');

const router = express.Router();

// Configure multer for image uploads
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// GET /api/admin/students - List all students (excludes archived by default)
router.get('/students', authMiddleware, async (req, res) => {
    try {
        const includeArchived = req.query.includeArchived === 'true';
        const filter = includeArchived ? {} : { status: { $ne: 'archived' } };
        const students = await Student.find(filter).select('-password');
        res.json(students);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/tuition-config - Get tuition fee structure
router.get('/tuition-config', authMiddleware, (req, res) => {
    res.json(TUITION_CONFIG);
});

// GET /api/admin/students/next-number - Get next student number
router.get('/students-next-number', authMiddleware, async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const lastStudent = await Student.findOne({ studentNo: new RegExp(`^${currentYear}-`) })
            .sort({ studentNo: -1 });

        let nextNum = 1;
        if (lastStudent) {
            const lastNum = parseInt(lastStudent.studentNo.split('-')[1]);
            nextNum = lastNum + 1;
        }

        const studentNo = `${currentYear}-${String(nextNum).padStart(4, '0')}`;
        res.json({ studentNo });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students - Create new student
router.post('/students', authMiddleware, upload.single('profileImage'), async (req, res) => {
    try {
        const { fullName, grade, guardian, guardianContact, address, birthDate, gender, paymentOption, enrolleeType } = req.body;

        // Generate student number
        const currentYear = new Date().getFullYear();
        const lastStudent = await Student.findOne({ studentNo: new RegExp(`^${currentYear}-`) })
            .sort({ studentNo: -1 });

        let nextNum = 1;
        if (lastStudent) {
            const lastNum = parseInt(lastStudent.studentNo.split('-')[1]);
            nextNum = lastNum + 1;
        }

        const studentNo = `${currentYear}-${String(nextNum).padStart(4, '0')}`;
        const defaultPassword = 'student123';

        // Generate payments based on grade and payment option
        const option = paymentOption || 'monthly';
        const { payments, totalTuition: computedTotal } = generatePayments(grade, option, enrolleeType || 'old');

        const table = TUITION_TABLE[enrolleeType || 'old'];
        const gradeData = table ? table[grade] : null;
        const finalTotal = computedTotal || (gradeData ? gradeData.grandTotal : 0);

        const student = new Student({
            studentNo,
            password: defaultPassword,
            fullName,
            grade,
            guardian,
            guardianContact,
            address,
            birthDate,
            gender,
            profileImage: req.file ? `/uploads/${req.file.filename}` : null,
            totalTuition: finalTotal,
            paymentOption: option,
            payments,
            activities: [],
            projects: [],
            assessments: []
        });

        await student.save();
        res.status(201).json({
            message: 'Student created successfully',
            student: { ...student.toObject(), password: undefined },
            credentials: { studentNo, password: defaultPassword }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/students/:id - Get single student
router.get('/students/:id', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id).select('-password');
        if (!student) return res.status(404).json({ message: 'Student not found' });
        res.json(student);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/profile - Update student profile
router.put('/students/:id/profile', authMiddleware, upload.single('profileImage'), async (req, res) => {
    try {
        const { fullName, grade, guardian, guardianContact, address, birthDate, gender, totalTuition, paymentOption } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        if (fullName) student.fullName = fullName;
        if (grade) student.grade = grade;
        if (guardian) student.guardian = guardian;
        if (guardianContact !== undefined) student.guardianContact = guardianContact;
        if (address !== undefined) student.address = address;
        if (birthDate !== undefined) student.birthDate = birthDate;
        if (gender !== undefined) student.gender = gender;
        if (totalTuition !== undefined) student.totalTuition = Number(totalTuition);
        if (paymentOption) student.paymentOption = paymentOption;
        if (req.file) student.profileImage = `/uploads/${req.file.filename}`;

        await student.save();
        clearCache(`student_${req.params.id}`);
        res.json({ message: 'Profile updated', student: { ...student.toObject(), password: undefined } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/assessments - Update grades
router.put('/students/:id/assessments', authMiddleware, async (req, res) => {
    try {
        const { assessments } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.assessments = assessments;
        await student.save();
        res.json({ message: 'Grades updated', assessments: student.assessments });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/payments - Add payment
router.post('/students/:id/payments', authMiddleware, async (req, res) => {
    try {
        const { date, description, amount, status } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.payments.push({ date, description, amount, status });
        await student.save();
        res.json({ message: 'Payment added', payments: student.payments });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/payments/:paymentId - Update payment status
router.put('/students/:id/payments/:paymentId', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const payment = student.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        payment.status = status;
        payment.paidDate = status === 'paid' ? new Date().toISOString().split('T')[0] : null;
        await student.save();
        res.json({ message: 'Payment updated', payments: student.payments });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/activities - Add activity
router.post('/students/:id/activities', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { title, date, subject, description } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const activity = {
            title,
            date,
            subject,
            description,
            imageUrl: req.file ? `/uploads/${req.file.filename}` : null
        };

        student.activities.push(activity);
        await student.save();
        res.json({ message: 'Activity added', activities: student.activities });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/projects - Add project
router.post('/students/:id/projects', authMiddleware, async (req, res) => {
    try {
        const { title, subject, dueDate, description, grade } = req.body;
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.projects.push({ title, subject, dueDate, description, grade });
        await student.save();
        res.json({ message: 'Project added', projects: student.projects });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/password - Change student password
router.put('/students/:id/password', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.password = password;
        await student.save();
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/admin/students/:id/activities/:activityId - Delete activity
router.delete('/students/:id/activities/:activityId', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.activities.pull({ _id: req.params.activityId });
        await student.save();
        res.json({ message: 'Activity deleted', activities: student.activities });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/admin/students/:id/projects/:projectId - Delete project
router.delete('/students/:id/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.projects.pull({ _id: req.params.projectId });
        await student.save();
        res.json({ message: 'Project deleted', projects: student.projects });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/force-logout - Clear student session
router.put('/students/:id/force-logout', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });
        student.activeToken = null;
        await student.save();
        res.json({ message: 'Student session cleared' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/admin/students/:id - Delete student (requires admin password)
router.delete('/students/:id', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ message: 'Password is required' });

        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.admin.id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        await Student.findByIdAndDelete(req.params.id);
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/archive - Archive student
router.put('/students/:id/archive', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.status = 'archived';
        await student.save();
        res.json({ message: 'Student archived', student: { ...student.toObject(), password: undefined } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/unarchive - Unarchive student
router.put('/students/:id/unarchive', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.status = 'active';
        await student.save();
        res.json({ message: 'Student unarchived', student: { ...student.toObject(), password: undefined } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
