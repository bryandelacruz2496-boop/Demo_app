const express = require('express');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Export student list as CSV
router.get('/students', authMiddleware, async (req, res) => {
    try {
        const students = await Student.find({ status: { $ne: 'archived' } });
        let csv = 'Student No,Full Name,Grade,Guardian,Contact,Total Tuition,Total Paid,Balance\n';
        students.forEach(s => {
            const paid = s.payments.filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]')).reduce((sum, p) => sum + p.amount, 0);
            csv += `${s.studentNo},"${s.fullName}","${s.grade || ''}","${s.guardian || ''}","${s.guardianContact || ''}",${s.totalTuition || 0},${paid},${(s.totalTuition || 0) - paid}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Export single student payments
router.get('/payments/:id', authMiddleware, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Not found' });
        let csv = `Payment Report - ${student.fullName} (${student.studentNo})\n\nDate,Description,Amount,Status,Paid Date\n`;
        student.payments.forEach(p => {
            csv += `${p.date},"${p.description}",${p.amount},${p.status},${p.paidDate || ''}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=payments_${student.studentNo}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Export all payments summary
router.get('/payments-all', authMiddleware, async (req, res) => {
    try {
        const students = await Student.find({ status: { $ne: 'archived' } });
        let csv = 'Student No,Full Name,Grade,Total Tuition,Total Paid,Balance,Status\n';
        students.forEach(s => {
            const paid = s.payments.filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]')).reduce((sum, p) => sum + p.amount, 0);
            const balance = (s.totalTuition || 0) - paid;
            csv += `${s.studentNo},"${s.fullName}","${s.grade || ''}",${s.totalTuition || 0},${paid},${balance},${balance <= 0 ? 'Fully Paid' : 'With Balance'}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=payment_summary.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
