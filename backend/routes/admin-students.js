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

// Helper: Redistribute remaining balance evenly across all pending payments.
// This keeps amounts consistent and avoids dumping everything into the last payment.
// EXCLUDES expenses — they are separate from tuition.
function adjustPendingPayments(student) {
    const paidTotal = student.payments
        .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
        .reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = (student.totalTuition || 0) - paidTotal;
    const pendingPayments = student.payments.filter(p => p.status === 'pending' && !p.description.startsWith('[Expense]'));

    if (pendingPayments.length === 0) return;

    if (remainingBalance <= 0) {
        // Everything is paid off - mark all pending as paid with 0
        pendingPayments.forEach(p => {
            p.amount = 0;
            p.status = 'paid';
            p.paidDate = p.paidDate || new Date().toISOString().split('T')[0];
        });
        return;
    }

    // Distribute evenly, last payment absorbs rounding remainder
    const perPayment = Math.floor(remainingBalance / pendingPayments.length);
    let distributed = 0;
    for (let i = 0; i < pendingPayments.length; i++) {
        if (i === pendingPayments.length - 1) {
            pendingPayments[i].amount = remainingBalance - distributed;
        } else {
            pendingPayments[i].amount = perPayment;
            distributed += perPayment;
        }
    }
}

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
            enrolleeType: enrolleeType || 'old',
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
        if (req.admin.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot add payments' });
        }

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

        student.payments.push({ date, description, amount, originalAmount: amount, status, paidDate: status === 'paid' ? (date || new Date().toISOString().split('T')[0]) : null });

        // Adjust last pending payment to absorb remaining balance
        adjustPendingPayments(student);

        await student.save();
        logAction('ADD_PAYMENT', req.admin.username, `Added payment â‚±${amount} for ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Payment added', payments: student.payments, totalTuition: student.totalTuition });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/discount - Add discount (deducts from totalTuition)
router.post('/students/:id/discount', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot add discounts' });
        }

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
            originalAmount: -discountAmount,
            status: 'paid',
            paidDate: date || new Date().toISOString().split('T')[0]
        });

        // Adjust last pending payment to absorb the discount
        adjustPendingPayments(student);

        // Add notification
        if (!student.notifications) student.notifications = [];
        student.notifications.push({
            message: `A discount of â‚±${discountAmount.toLocaleString()} has been applied: ${description || 'Discount'}`,
            type: 'payment',
            read: false
        });

        await student.save();
        logAction('ADD_DISCOUNT', req.admin.username, `Applied discount â‚±${discountAmount} to ${student.fullName}`, student.studentNo, req.ip);
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
                originalAmount: -discountAmount,
                status: 'paid',
                paidDate: date || new Date().toISOString().split('T')[0]
            });

            // Adjust last pending payment to absorb the discount
            adjustPendingPayments(student);

            if (!student.notifications) student.notifications = [];
            student.notifications.push({
                message: `A discount of â‚±${discountAmount.toLocaleString()} has been applied: ${description || 'Discount'}`,
                type: 'payment',
                read: false
            });
            await student.save();
            updatedCount++;
        }

        logAction('BULK_DISCOUNT', req.admin.username, `Applied discount â‚±${discountAmount} to ${updatedCount} students`, 'BULK', req.ip);
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

        // Adjust last pending payment to absorb remaining balance (don't redistribute all)
        adjustPendingPayments(student);

        // Add notification for student
        if (!student.notifications) student.notifications = [];
        student.notifications.push({
            message: status === 'paid'
                ? `Your payment of â‚±${payment.amount.toLocaleString()} for "${payment.description}" has been confirmed as paid.`
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

// DELETE /api/admin/students/:id/payments/:paymentId - Delete a payment record (superadmin only)
router.delete('/students/:id/payments/:paymentId', authMiddleware, async (req, res) => {
    try {
        // Only superadmin can delete payment records
        if (req.admin.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Super Admin can delete payment records' });
        }

        const { password } = req.body;

        // Verify admin password
        if (!password) return res.status(400).json({ message: 'Password is required' });
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.admin.id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });

        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const payment = student.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        const isDiscount = payment.amount < 0;
        const isExpense = payment.description && payment.description.startsWith('[Expense]');
        const desc = payment.description;
        const amt = payment.amount;

        // If it's a discount, restore totalTuition
        if (isDiscount) {
            const discountAmount = Math.abs(payment.amount);
            student.totalTuition = (student.totalTuition || 0) + discountAmount;
        }

        // Remove the payment entry
        student.payments.pull({ _id: req.params.paymentId });

        // If it was NOT an expense, recalculate the last pending payment
        // (expenses don't affect tuition balance)
        if (!isExpense) {
            adjustPendingPayments(student);
        }

        await student.save();
        logAction('DELETE_PAYMENT', req.admin.username, `Deleted payment record "${desc}" ₱${Math.abs(amt)} from ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Payment record deleted', payments: student.payments, totalTuition: student.totalTuition });
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

        // Adjust last pending payment to absorb the restored amount
        adjustPendingPayments(student);

        await student.save();
        logAction('REMOVE_DISCOUNT', req.admin.username, `Removed discount â‚±${discountAmount} from ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Discount removed', payments: student.payments, totalTuition: student.totalTuition });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/students/:id/expense - Add other expense (does NOT affect tuition)
router.post('/students/:id/expense', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot add expenses' });
        }

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

        // Add expense as a payment record with type 'expense'
        student.payments.push({
            date,
            description: `[Expense] ${description}`,
            amount: Number(amount),
            status: status || 'paid',
            paidDate: status === 'paid' ? (date || new Date().toISOString().split('T')[0]) : null
        });

        await student.save();
        logAction('ADD_EXPENSE', req.admin.username, `Added expense â‚±${amount} for ${student.fullName}: ${description}`, student.studentNo, req.ip);
        res.json({ message: 'Expense added', payments: student.payments, totalTuition: student.totalTuition });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/payment-scheme - Change payment scheme
router.put('/students/:id/payment-scheme', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot change payment scheme' });
        }

        const { paymentOption, password } = req.body;

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

        const validOptions = ['monthly', 'two_payments', 'full'];
        if (!validOptions.includes(paymentOption)) {
            return res.status(400).json({ message: 'Invalid payment option' });
        }

        // Get grade tuition data
        const grade = student.grade;
        const type = student.enrolleeType || 'old';
        const table = TUITION_TABLE[type];
        const gradeData = table ? table[grade] : null;

        if (!gradeData) {
            return res.status(400).json({ message: 'Cannot determine tuition for this grade' });
        }

        const baseTuition = gradeData.tuition;
        const misc = gradeData.miscTotal;

        // Calculate existing discount percentage from payment records
        let discountPct = 0;
        let flatDiscounts = 0;
        student.payments.forEach(p => {
            if (p.amount < 0 && p.description) {
                if (p.description.includes('10%') || p.description.toLowerCase().includes('siblings') || p.description.toLowerCase().includes('friends')) {
                    discountPct += 10;
                } else if (p.description.includes('5%') || p.description.toLowerCase().includes('early bird')) {
                    discountPct += 5;
                } else if (p.description.includes('30%') || p.description.toLowerCase().includes('employee')) {
                    discountPct += 30;
                } else {
                    // Flat discount (referral, custom)
                    flatDiscounts += Math.abs(p.amount);
                }
            }
        });

        const percentageDiscount = Math.round(baseTuition * (discountPct / 100));
        const totalDiscounts = percentageDiscount + flatDiscounts;

        // Calculate new totalTuition based on scheme
        let newTotal;
        if (paymentOption === 'full') {
            const less3 = Math.round(baseTuition * 0.03);
            newTotal = baseTuition - less3 + misc - totalDiscounts;
        } else if (paymentOption === 'two_payments') {
            const interest = Math.round(baseTuition * 0.05);
            newTotal = baseTuition + interest + misc - totalDiscounts;
        } else {
            // monthly - 7% interest on tuition
            const interest = Math.round(baseTuition * 0.07);
            newTotal = baseTuition + interest + misc - totalDiscounts;
        }

        // Calculate what's already been paid (exclude discounts and expenses)
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
            .reduce((sum, p) => sum + p.amount, 0);

        // Remove all pending non-expense payments
        student.payments = student.payments.filter(p =>
            p.status === 'paid' || p.description.startsWith('[Expense]')
        );

        // Update totalTuition and paymentOption
        student.totalTuition = newTotal;
        student.paymentOption = paymentOption;

        // Calculate remaining balance
        const remainingBalance = newTotal - paidTotal;

        // Generate new pending payments for remaining balance
        if (remainingBalance > 0) {
            if (paymentOption === 'full') {
                student.payments.push({
                    date: new Date().toISOString().split('T')[0],
                    description: 'Full Payment (remaining balance)',
                    amount: remainingBalance,
                    originalAmount: remainingBalance,
                    status: 'pending'
                });
            } else if (paymentOption === 'two_payments') {
                const half = Math.round(remainingBalance / 2);
                student.payments.push({
                    date: '2026-06-01',
                    description: 'First Payment',
                    amount: half,
                    originalAmount: half,
                    status: 'pending'
                });
                student.payments.push({
                    date: '2026-12-01',
                    description: 'Second Payment',
                    amount: remainingBalance - half,
                    originalAmount: remainingBalance - half,
                    status: 'pending'
                });
            } else {
                // Monthly: distribute remaining across months that haven't passed
                const now = new Date();
                const months = [
                    { month: '06', name: 'June 2026', date: new Date('2026-06-01') },
                    { month: '07', name: 'July 2026', date: new Date('2026-07-01') },
                    { month: '08', name: 'August 2026', date: new Date('2026-08-01') },
                    { month: '09', name: 'September 2026', date: new Date('2026-09-01') },
                    { month: '10', name: 'October 2026', date: new Date('2026-10-01') },
                    { month: '11', name: 'November 2026', date: new Date('2026-11-01') },
                    { month: '12', name: 'December 2026', date: new Date('2026-12-01') }
                ];

                // Include current month and future months
                const availableMonths = months.filter(m => m.date >= new Date(now.getFullYear(), now.getMonth(), 1));
                const numPayments = availableMonths.length || 1;
                const perPayment = Math.floor(remainingBalance / numPayments);
                let distributed = 0;

                for (let i = 0; i < numPayments; i++) {
                    const amt = (i === numPayments - 1) ? remainingBalance - distributed : perPayment;
                    student.payments.push({
                        date: `2026-${availableMonths[i].month}-01`,
                        description: `Monthly Payment - ${availableMonths[i].name}`,
                        amount: amt,
                        originalAmount: amt,
                        status: 'pending'
                    });
                    distributed += amt;
                }
            }
        }

        // Add notification
        if (!student.notifications) student.notifications = [];
        student.notifications.push({
            message: `Your payment scheme has been changed to ${paymentOption === 'full' ? 'Full Payment' : paymentOption === 'two_payments' ? 'Two Payments' : 'Monthly (7 installments)'}`,
            type: 'payment',
            read: false
        });

        await student.save();
        logAction('CHANGE_SCHEME', req.admin.username, `Changed payment scheme to ${paymentOption} for ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Payment scheme updated', payments: student.payments, totalTuition: student.totalTuition, paymentOption: student.paymentOption });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/admin/students/:id/enrollee-type - Change enrollee type and recalculate
router.put('/students/:id/enrollee-type', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role === 'staff') {
            return res.status(403).json({ message: 'Staff cannot change enrollee type' });
        }

        const { enrolleeType, password } = req.body;

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

        if (!['old', 'new'].includes(enrolleeType)) {
            return res.status(400).json({ message: 'Invalid enrollee type' });
        }

        const grade = student.grade;
        const gradeData = TUITION_TABLE[enrolleeType] && TUITION_TABLE[enrolleeType][grade];
        if (!gradeData) {
            return res.status(400).json({ message: 'Cannot determine tuition for this grade and enrollee type' });
        }

        const baseTuition = gradeData.tuition;
        const misc = gradeData.miscTotal;
        const paymentOption = student.paymentOption || 'monthly';

        // Calculate existing discounts
        let discountPct = 0, flatDiscounts = 0;
        student.payments.forEach(p => {
            if (p.amount < 0 && p.description) {
                if (p.description.includes('10%') || p.description.toLowerCase().includes('siblings') || p.description.toLowerCase().includes('friends')) discountPct += 10;
                else if (p.description.includes('5%') || p.description.toLowerCase().includes('early bird')) discountPct += 5;
                else if (p.description.includes('30%') || p.description.toLowerCase().includes('employee')) discountPct += 30;
                else flatDiscounts += Math.abs(p.amount);
            }
        });
        const totalDiscounts = Math.round(baseTuition * (discountPct / 100)) + flatDiscounts;

        // Calculate correct totalTuition
        let newTotal;
        if (paymentOption === 'full') {
            newTotal = baseTuition - Math.round(baseTuition * 0.03) + misc - totalDiscounts;
        } else if (paymentOption === 'two_payments') {
            newTotal = baseTuition + Math.round(baseTuition * 0.05) + misc - totalDiscounts;
        } else {
            newTotal = baseTuition + Math.round(baseTuition * 0.07) + misc - totalDiscounts;
        }

        // What's already paid
        const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
            .reduce((sum, p) => sum + p.amount, 0);

        // Update student
        student.enrolleeType = enrolleeType;
        student.totalTuition = newTotal;

        // Remove pending non-expense payments
        student.payments = student.payments.filter(p =>
            p.status === 'paid' || (p.description && p.description.startsWith('[Expense]'))
        );

        // Regenerate pending payments
        const remainingBalance = newTotal - paidTotal;
        if (remainingBalance > 0) {
            if (paymentOption === 'full') {
                student.payments.push({ date: '2026-06-01', description: 'Full Payment (3% discount)', amount: remainingBalance, originalAmount: remainingBalance, status: 'pending' });
            } else if (paymentOption === 'two_payments') {
                const half = Math.round(remainingBalance / 2);
                student.payments.push({ date: '2026-06-01', description: 'First Payment (Upon Enrollment)', amount: half, originalAmount: half, status: 'pending' });
                student.payments.push({ date: '2026-12-01', description: 'Second Payment (December 2026)', amount: remainingBalance - half, originalAmount: remainingBalance - half, status: 'pending' });
            } else {
                const { MONTHLY_SCHEDULES } = require('../config/tuition');
                const months = ['06', '07', '08', '09', '10', '11', '12'];
                const monthNames = ['June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026'];
                const schedules = MONTHLY_SCHEDULES[enrolleeType];
                const schedule = schedules && schedules[grade];

                if (schedule) {
                    let startMonth = 0, covered = 0;
                    for (let i = 0; i < 7; i++) {
                        if (covered + schedule[i] <= paidTotal + 1) { covered += schedule[i]; startMonth = i + 1; } else break;
                    }
                    if (startMonth >= 7) startMonth = 6;
                    for (let i = startMonth; i < 7; i++) {
                        student.payments.push({ date: `2026-${months[i]}-01`, description: `Monthly Payment - ${monthNames[i]}`, amount: schedule[i], originalAmount: schedule[i], status: 'pending' });
                    }
                    // Adjust if needed
                    const pending = student.payments.filter(p => p.status === 'pending' && !p.description.startsWith('[Expense]'));
                    const pTotal = pending.reduce((s, p) => s + p.amount, 0);
                    if (Math.abs(pTotal - remainingBalance) > 1 && pending.length > 0) {
                        const per = Math.floor(remainingBalance / pending.length);
                        let dist = 0;
                        pending.forEach((p, i) => { if (i === pending.length - 1) p.amount = remainingBalance - dist; else { p.amount = per; dist += per; } });
                    }
                } else {
                    const per = Math.floor(remainingBalance / 7);
                    let dist = 0;
                    for (let i = 0; i < 7; i++) {
                        const amt = i === 6 ? remainingBalance - dist : per;
                        student.payments.push({ date: `2026-${months[i]}-01`, description: `Monthly Payment - ${monthNames[i]}`, amount: amt, originalAmount: amt, status: 'pending' });
                        dist += amt;
                    }
                }
            }
        }

        await student.save();
        logAction('CHANGE_ENROLLEE_TYPE', req.admin.username, `Changed enrollee type to ${enrolleeType} for ${student.fullName}`, student.studentNo, req.ip);
        res.json({ message: 'Enrollee type updated', payments: student.payments, totalTuition: student.totalTuition, enrolleeType: student.enrolleeType, paymentOption: student.paymentOption });
    } catch (err) {
        console.error(err);
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

// PUT /api/admin/students/:id/archive - Archive student (superadmin only)
router.put('/students/:id/archive', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Super Admin can archive students' });
        }

        // Verify admin password
        const { password } = req.body;
        if (password) {
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);
            if (!admin) return res.status(404).json({ message: 'Admin not found' });
            const isMatch = await admin.comparePassword(password);
            if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
        }

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
        logAction('UPDATE_ATTENDANCE', req.admin.username, `Marked ${student.fullName} as ${status} on ${date}`, student.studentNo, req.ip);
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

        const statusSummary = { P: 0, L: 0, E: 0, U: 0 };
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
            if (statusSummary[record.status] !== undefined) statusSummary[record.status]++;
        }

        const summary = Object.entries(statusSummary).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ');
        logAction('BULK_ATTENDANCE', req.admin.username, `Bulk attendance on ${date} for ${records.length} students (${summary})`, 'BULK', req.ip);
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
        logAction('REMOVE_ATTENDANCE', req.admin.username, `Removed attendance for ${student.fullName} on ${req.params.date}`, student.studentNo, req.ip);
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
            adjustPendingPayments(student);
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
