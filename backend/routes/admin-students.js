const express = require('express');
const path = require('path');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { TUITION_TABLE, generatePayments } = require('../config/tuition');
const { clearCache } = require('../middleware/cache');
const { logAction } = require('../middleware/auditLogger');
const { validatePassword } = require('../middleware/passwordPolicy');
const { encryptUploadedFile } = require('../middleware/fileEncryption');
const { cloudinary, upload, uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

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
        const { fullName, grade, guardian, guardianContact, address, birthDate, gender, paymentOption, enrolleeType, discount } = req.body;

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
        let finalTotal = computedTotal || (gradeData ? gradeData.grandTotal : 0);

        // Apply discount on TUITION only (not misc), then recalculate total
        if (discount && discount !== 'none' && gradeData) {
            let tuition = gradeData.tuition || 0;
            let discountAmount = 0;

            if (discount === 'siblings' || discount === 'friends_family') {
                discountAmount = Math.round(tuition * 0.10);
            } else if (discount === 'employee') {
                discountAmount = Math.round(tuition * 0.30);
            } else if (discount === 'early_bird') {
                discountAmount = Math.round(tuition * 0.05);
            } else if (discount === 'late_enrollment') {
                discountAmount = -1000;
            }

            finalTotal = finalTotal - discountAmount;
        }

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
            profileImage: req.file ? (await uploadToCloudinary(req.file.buffer)).secure_url : null,
            totalTuition: finalTotal,
            paymentOption: option,
            payments: discount === 'late_enrollment' ? [...payments, { date: new Date().toISOString().split('T')[0], description: 'Late Enrollment Fee', amount: 1000, status: 'pending' }] : payments,
            activities: [],
            projects: [],
            assessments: []
        });

        await student.save();
        logAction('CREATE_STUDENT', req.admin.username, `Created student ${student.fullName}`, student.studentNo, req.ip);
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
        logAction('VIEW_STUDENT', req.admin.username, `Viewed student ${student.fullName}`, student.studentNo, req.ip);
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
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            student.profileImage = result.secure_url;
        }

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
        const { date, description, amount, status, password } = req.body;

        // Verify admin password
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.payments.push({ date, description, amount, status });

        // Recalculate pending payment amounts to match remaining balance
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0)
            .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = (student.totalTuition || 0) - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

        if (pendingPayments.length > 0 && remainingBalance > 0) {
            const perPayment = Math.round(remainingBalance / pendingPayments.length);
            const lastIndex = pendingPayments.length - 1;
            let distributed = 0;
            pendingPayments.forEach((p, i) => {
                if (i === lastIndex) {
                    p.amount = remainingBalance - distributed;
                } else {
                    p.amount = perPayment;
                    distributed += perPayment;
                }
            });
        } else if (pendingPayments.length > 0 && remainingBalance <= 0) {
            pendingPayments.forEach(p => { p.amount = 0; });
        }

        await student.save();
        logAction('ADD_PAYMENT', req.admin.username, `Added payment ₱${amount} for ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Payment added', payments: student.payments, totalTuition: student.totalTuition });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/discount - Add discount (deducts from totalTuition)
router.post('/students/:id/discount', authMiddleware, async (req, res) => {
    try {
        const { date, description, amount, password } = req.body;

        // Verify admin password
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const discountAmount = Math.abs(Number(amount));
        if (!discountAmount || discountAmount <= 0) {
            return res.status(400).json({ message: 'Invalid discount amount' });
        }

        // Deduct from totalTuition
        student.totalTuition = (student.totalTuition || 0) - discountAmount;

        // Add a record in payments for tracking (as paid, with the discount description)
        student.payments.push({
            date: date || new Date().toISOString().split('T')[0],
            description: description || 'Discount',
            amount: -discountAmount,
            status: 'paid',
            paidDate: date || new Date().toISOString().split('T')[0]
        });

        // Recalculate pending payment amounts to match new totalTuition
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0)
            .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = student.totalTuition - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

        if (pendingPayments.length > 0 && remainingBalance > 0) {
            const perPayment = Math.round(remainingBalance / pendingPayments.length);
            const lastIndex = pendingPayments.length - 1;
            let distributed = 0;
            pendingPayments.forEach((p, i) => {
                if (i === lastIndex) {
                    p.amount = remainingBalance - distributed;
                } else {
                    p.amount = perPayment;
                    distributed += perPayment;
                }
            });
        } else if (pendingPayments.length > 0 && remainingBalance <= 0) {
            pendingPayments.forEach(p => { p.amount = 0; });
        }

        // Add notification
        if (!student.notifications) student.notifications = [];
        student.notifications.push({
            message: `A discount of ₱${discountAmount.toLocaleString()} has been applied: ${description || 'Discount'}`,
            type: 'payment',
            read: false
        });

        await student.save();
        logAction('ADD_DISCOUNT', req.admin.username, `Applied discount ₱${discountAmount} to ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Discount applied', payments: student.payments, totalTuition: student.totalTuition });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/discount/bulk - Apply discount to all active students
router.post('/students-discount-bulk', authMiddleware, async (req, res) => {
    try {
        const { date, description, amount, grade, password } = req.body;

        // Verify admin password
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        const discountAmount = Math.abs(Number(amount));
        if (!discountAmount || discountAmount <= 0) {
            return res.status(400).json({ message: 'Invalid discount amount' });
        }

        const filter = { status: { $ne: 'archived' } };
        if (grade && grade !== 'all') filter.grade = grade;

        const students = await Student.find(filter);
        let updatedCount = 0;

        for (const student of students) {
            student.totalTuition = (student.totalTuition || 0) - discountAmount;
            student.payments.push({
                date: date || new Date().toISOString().split('T')[0],
                description: description || 'Discount',
                amount: -discountAmount,
                status: 'paid',
                paidDate: date || new Date().toISOString().split('T')[0]
            });

            // Recalculate pending payment amounts to match new totalTuition
            const paidTotal = student.payments
                .filter(p => p.status === 'paid' && p.amount > 0)
                .reduce((sum, p) => sum + p.amount, 0);
            const remainingBalance = student.totalTuition - paidTotal;
            const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

            if (pendingPayments.length > 0 && remainingBalance > 0) {
                const perPayment = Math.round(remainingBalance / pendingPayments.length);
                const lastIndex = pendingPayments.length - 1;
                let distributed = 0;
                pendingPayments.forEach((p, i) => {
                    if (i === lastIndex) {
                        p.amount = remainingBalance - distributed;
                    } else {
                        p.amount = perPayment;
                        distributed += perPayment;
                    }
                });
            } else if (pendingPayments.length > 0 && remainingBalance <= 0) {
                pendingPayments.forEach(p => { p.amount = 0; });
            }

            if (!student.notifications) student.notifications = [];
            student.notifications.push({
                message: `A discount of ₱${discountAmount.toLocaleString()} has been applied: ${description || 'Discount'}`,
                type: 'payment',
                read: false
            });
            await student.save();
            updatedCount++;
        }

        logAction('BULK_DISCOUNT', req.admin.username, `Applied discount ₱${discountAmount} to ${updatedCount} students`, 'BULK', req.ip);
        res.json({ message: `Discount applied to ${updatedCount} students`, updatedCount });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/payments/:paymentId - Update payment status
router.put('/students/:id/payments/:paymentId', authMiddleware, async (req, res) => {
    try {
        const { status, password } = req.body;

        // Verify admin password
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const payment = student.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        payment.status = status;
        payment.paidDate = status === 'paid' ? new Date().toISOString().split('T')[0] : null;

        // Recalculate pending payment amounts to match remaining balance
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0)
            .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = (student.totalTuition || 0) - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

        if (pendingPayments.length > 0 && remainingBalance > 0) {
            const perPayment = Math.round(remainingBalance / pendingPayments.length);
            const lastIndex = pendingPayments.length - 1;
            let distributed = 0;
            pendingPayments.forEach((p, i) => {
                if (i === lastIndex) {
                    p.amount = remainingBalance - distributed;
                } else {
                    p.amount = perPayment;
                    distributed += perPayment;
                }
            });
        } else if (pendingPayments.length > 0 && remainingBalance <= 0) {
            pendingPayments.forEach(p => { p.amount = 0; });
        }

        // Add notification for student
        if (!student.notifications) student.notifications = [];
        student.notifications.push({
            message: status === 'paid'
                ? `Your payment of ₱${payment.amount.toLocaleString()} for "${payment.description}" has been confirmed as paid.`
                : `Your payment for "${payment.description}" has been marked as pending.`,
            type: 'payment',
            read: false
        });

        await student.save();
        logAction('UPDATE_PAYMENT', req.admin.username, `Marked payment as ${status} for ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Payment updated', payments: student.payments });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/admin/students/:id/payments/:paymentId/remove-discount - Remove a discount
router.delete('/students/:id/payments/:paymentId/remove-discount', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;

        // Verify admin password
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const payment = student.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Discount not found' });
        if (payment.amount >= 0) return res.status(400).json({ message: 'This is not a discount entry' });

        // Add the discount amount back to totalTuition
        const discountAmount = Math.abs(payment.amount);
        student.totalTuition = (student.totalTuition || 0) + discountAmount;

        // Remove the discount entry
        student.payments.pull({ _id: req.params.paymentId });

        // Recalculate pending payment amounts
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0)
            .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = (student.totalTuition || 0) - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

        if (pendingPayments.length > 0 && remainingBalance > 0) {
            const perPayment = Math.round(remainingBalance / pendingPayments.length);
            const lastIndex = pendingPayments.length - 1;
            let distributed = 0;
            pendingPayments.forEach((p, i) => {
                if (i === lastIndex) {
                    p.amount = remainingBalance - distributed;
                } else {
                    p.amount = perPayment;
                    distributed += perPayment;
                }
            });
        } else if (pendingPayments.length > 0 && remainingBalance <= 0) {
            pendingPayments.forEach(p => { p.amount = 0; });
        }

        await student.save();
        logAction('REMOVE_DISCOUNT', req.admin.username, `Removed discount ₱${discountAmount} from ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Discount removed', payments: student.payments, totalTuition: student.totalTuition });
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
            imageUrl: req.file ? (await uploadToCloudinary(req.file.buffer)).secure_url : null
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

        // Enforce password policy
        const policyResult = validatePassword(password);
        if (!policyResult.valid) {
            return res.status(400).json({
                message: 'Password does not meet requirements',
                errors: policyResult.errors
            });
        }

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.password = password;
        student.mustChangePassword = true;
        await student.save();
        logAction('CHANGE_PASSWORD', req.admin.username, `Changed password for ${student.fullName}`, student.studentNo, req.ip);
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

// PUT /api/admin/students/:id/reenroll - Re-enroll existing student with updated data
router.put('/students/:id/reenroll', authMiddleware, upload.single('profileImage'), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const { fullName, grade, guardian, guardianContact, address, birthDate, gender, paymentOption, enrolleeType } = req.body;

        // Update student info
        if (fullName) student.fullName = fullName;
        if (grade) student.grade = grade;
        if (guardian) student.guardian = guardian;
        if (guardianContact) student.guardianContact = guardianContact;
        if (address) student.address = address;
        if (birthDate) student.birthDate = birthDate;
        if (gender) student.gender = gender;
        if (paymentOption) student.paymentOption = paymentOption;
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            student.profileImage = result.secure_url;
        }

        // Update tuition and generate new payments based on new grade/payment option
        if (grade && paymentOption) {
            const { TUITION_TABLE, generatePayments } = require('../config/tuition');
            const type = enrolleeType || 'old';
            const tuitionData = TUITION_TABLE[type] && TUITION_TABLE[type][grade];
            if (tuitionData) {
                student.totalTuition = tuitionData.total;
                // Keep all existing payments (paid + pending from previous), add new payments
                const existingPayments = student.payments || [];
                const newPayments = generatePayments(grade, paymentOption, type);
                student.payments = [...existingPayments, ...newPayments];
            }
        }

        // Unarchive if archived
        if (student.status === 'archived') student.status = 'active';

        await student.save();
        res.json({ message: 'Student re-enrolled', student });
    } catch (err) {
        console.error(err);
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
        logAction('DELETE_STUDENT', req.admin.username, `Deleted student ${student.fullName}`, student.studentNo, req.ip);
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
        logAction('ARCHIVE_STUDENT', req.admin.username, `Archived student ${student.fullName}`, student.studentNo, req.ip);
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

// ============================================
// ATTENDANCE ROUTES
// ============================================

// GET /api/admin/attendance - Get attendance for all students (filterable by grade and date range)
router.get('/attendance', authMiddleware, async (req, res) => {
    try {
        const { grade, month, year } = req.query;
        const filter = { status: { $ne: 'archived' } };
        if (grade && grade !== 'all') filter.grade = grade;

        const students = await Student.find(filter).select('fullName studentNo grade attendance');

        // Filter attendance by month/year if provided
        const result = students.map(s => {
            let records = s.attendance || [];
            if (month && month !== 'all') {
                records = records.filter(a => a.date && a.date.substring(5, 7) === month);
            }
            if (year && year !== 'all') {
                records = records.filter(a => a.date && a.date.substring(0, 4) === year);
            }
            return {
                _id: s._id,
                fullName: s.fullName,
                studentNo: s.studentNo,
                grade: s.grade,
                attendance: records
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/attendance - Add/update attendance for a student
router.post('/students/:id/attendance', authMiddleware, async (req, res) => {
    try {
        const { date, status } = req.body;
        if (!date || !status) return res.status(400).json({ message: 'Date and status required' });

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        // Check if attendance for this date already exists
        const existing = student.attendance.find(a => a.date === date);
        if (existing) {
            existing.status = status;
        } else {
            student.attendance.push({ date, status });
        }

        await student.save();
        res.json({ message: 'Attendance updated', attendance: student.attendance });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/attendance/bulk - Bulk update attendance for multiple students
router.post('/attendance/bulk', authMiddleware, async (req, res) => {
    try {
        const { date, records } = req.body;
        // records = [{ studentId, status }]
        if (!date || !records || !Array.isArray(records)) {
            return res.status(400).json({ message: 'Date and records array required' });
        }

        for (const record of records) {
            const student = await Student.findById(record.studentId);
            if (!student) continue;

            const existing = student.attendance.find(a => a.date === date);
            if (existing) {
                existing.status = record.status;
            } else {
                student.attendance.push({ date, status: record.status });
            }
            await student.save();
        }

        res.json({ message: 'Bulk attendance updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/admin/students/:id/attendance/:date - Remove attendance record
router.delete('/students/:id/attendance/:date', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        student.attendance = student.attendance.filter(a => a.date !== req.params.date);
        await student.save();
        res.json({ message: 'Attendance record removed', attendance: student.attendance });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students-recalculate - Recalculate all pending payments for all students
router.post('/students-recalculate', authMiddleware, async (req, res) => {
    try {
        const students = await Student.find({ status: { $ne: 'archived' } });
        let updatedCount = 0;

        for (const student of students) {
            const paidTotal = student.payments
                .filter(p => p.status === 'paid' && p.amount > 0)
                .reduce((sum, p) => sum + p.amount, 0);

            const remainingBalance = (student.totalTuition || 0) - paidTotal;
            const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);

            if (pendingPayments.length === 0) continue;

            if (remainingBalance > 0) {
                const perPayment = Math.round(remainingBalance / pendingPayments.length);
                const lastIndex = pendingPayments.length - 1;
                let distributed = 0;
                pendingPayments.forEach((p, i) => {
                    if (i === lastIndex) {
                        p.amount = remainingBalance - distributed;
                    } else {
                        p.amount = perPayment;
                        distributed += perPayment;
                    }
                });
            } else {
                pendingPayments.forEach(p => { p.amount = 0; });
            }

            await student.save();
            updatedCount++;
        }

        logAction('RECALCULATE_PAYMENTS', req.admin.username, `Recalculated pending payments for ${updatedCount} students`, 'BULK', req.ip);
        res.json({ message: `Recalculated payments for ${updatedCount} students`, updatedCount });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
