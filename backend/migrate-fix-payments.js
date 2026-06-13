// Migration script: Fix all student payment amounts
// This script:
// 1. Sets originalAmount on all payments that don't have it
// 2. Restores pending payments to their original scheduled amounts
// 3. Adjusts only the last pending payment to absorb any discount/balance difference
//
// Run with: node migrate-fix-payments.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
    require('dotenv').config();
}
const mongoose = require('mongoose');
const Student = require('./models/Student');
const { TUITION_TABLE, MONTHLY_SCHEDULES } = require('./config/tuition');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to database');

        const students = await Student.find({});
        let updatedCount = 0;

        for (const student of students) {
            let changed = false;

            // Step 1: Set originalAmount on payments that don't have it
            for (const payment of student.payments) {
                if (payment.originalAmount === null || payment.originalAmount === undefined) {
                    // For monthly payments, try to match against the tuition schedule
                    if (payment.description && payment.description.startsWith('Monthly Payment')) {
                        const grade = student.grade;
                        // Try old enrollee type first (most common)
                        const scheduleOld = MONTHLY_SCHEDULES['old'] && MONTHLY_SCHEDULES['old'][grade];
                        const scheduleNew = MONTHLY_SCHEDULES['new'] && MONTHLY_SCHEDULES['new'][grade];
                        const schedule = scheduleOld || scheduleNew;

                        if (schedule) {
                            // Find which month this payment is for
                            const monthNames = ['June', 'July', 'August', 'September', 'October', 'November', 'December'];
                            const monthIndex = monthNames.findIndex(m => payment.description.includes(m));
                            if (monthIndex >= 0 && schedule[monthIndex]) {
                                payment.originalAmount = schedule[monthIndex];
                                changed = true;
                            } else {
                                // Fallback: use current amount as original
                                payment.originalAmount = payment.amount;
                                changed = true;
                            }
                        } else {
                            payment.originalAmount = payment.amount;
                            changed = true;
                        }
                    } else {
                        // For non-monthly payments (full, two_payments, manual, discounts, expenses)
                        payment.originalAmount = payment.amount;
                        changed = true;
                    }
                }
            }

            // Step 2: Restore pending payments to their originalAmount (except last)
            // and adjust only the last pending payment
            const paidTotal = student.payments
                .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
                .reduce((sum, p) => sum + p.amount, 0);
            const remainingBalance = (student.totalTuition || 0) - paidTotal;
            const pendingPayments = student.payments.filter(p => p.status === 'pending');

            if (pendingPayments.length > 0) {
                if (remainingBalance <= 0) {
                    pendingPayments.forEach(p => {
                        p.amount = 0;
                        p.status = 'paid';
                        p.paidDate = p.paidDate || new Date().toISOString().split('T')[0];
                    });
                    changed = true;
                } else {
                    // Restore all except last to their originalAmount
                    let sumOfOtherPending = 0;
                    for (let i = 0; i < pendingPayments.length - 1; i++) {
                        const p = pendingPayments[i];
                        if (p.originalAmount && p.amount !== p.originalAmount) {
                            p.amount = p.originalAmount;
                            changed = true;
                        }
                        sumOfOtherPending += p.amount;
                    }

                    // Adjust last pending payment
                    const lastPending = pendingPayments[pendingPayments.length - 1];
                    const expectedLast = remainingBalance - sumOfOtherPending;
                    if (expectedLast > 0) {
                        if (lastPending.amount !== expectedLast) {
                            lastPending.amount = expectedLast;
                            changed = true;
                        }
                    } else {
                        lastPending.amount = 0;
                        lastPending.status = 'paid';
                        lastPending.paidDate = lastPending.paidDate || new Date().toISOString().split('T')[0];
                        changed = true;
                    }
                }
            }

            if (changed) {
                await student.save();
                updatedCount++;
                console.log(`Fixed: ${student.fullName} (${student.studentNo}) - Total: ₱${student.totalTuition}, Paid: ₱${paidTotal}, Remaining: ₱${remainingBalance}`);
            }
        }

        console.log(`\nMigration complete! Updated ${updatedCount} of ${students.length} students.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

migrate();
