// One-time script to recalculate all pending payment amounts
// Uses "adjust last only" approach - keeps original amounts stable
// Run with: node fix-pending-payments.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
    require('dotenv').config();
}
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function fixPendingPayments() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to database');

        const students = await Student.find({ status: { $ne: 'archived' } });
        let updatedCount = 0;

        for (const student of students) {
            const paidTotal = student.payments
                .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
                .reduce((sum, p) => sum + p.amount, 0);

            const remainingBalance = (student.totalTuition || 0) - paidTotal;
            const pendingPayments = student.payments.filter(p => p.status === 'pending');

            if (pendingPayments.length === 0) continue;

            if (remainingBalance <= 0) {
                pendingPayments.forEach(p => {
                    p.amount = 0;
                    p.status = 'paid';
                    p.paidDate = p.paidDate || new Date().toISOString().split('T')[0];
                });
            } else {
                // Restore all pending payments to originalAmount except the last one
                let sumOfOtherPending = 0;
                for (let i = 0; i < pendingPayments.length - 1; i++) {
                    const p = pendingPayments[i];
                    p.amount = p.originalAmount || p.amount;
                    sumOfOtherPending += p.amount;
                }

                // Adjust only the last pending payment
                const lastPending = pendingPayments[pendingPayments.length - 1];
                const lastAmount = remainingBalance - sumOfOtherPending;
                if (lastAmount > 0) {
                    lastPending.amount = lastAmount;
                } else {
                    lastPending.amount = 0;
                    lastPending.status = 'paid';
                    lastPending.paidDate = lastPending.paidDate || new Date().toISOString().split('T')[0];
                }
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
