// One-time script to recalculate all pending payment amounts
// Run with: node fix-pending-payments.js

require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function fixPendingPayments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to database');

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
            console.log(`Fixed: ${student.fullName} (${student.studentNo}) - Balance: ${remainingBalance}, Pending payments: ${pendingPayments.length}`);
        }

        console.log(`\nDone! Updated ${updatedCount} students.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixPendingPayments();
