// Migration script: Set enrolleeType for all existing students and recalculate tuition
// Based on table.md as source of truth
//
// Logic to determine enrolleeType:
// - If student already has enrolleeType set, keep it
// - Otherwise, infer from their grade and original payment amounts
//   by checking which table (old/new) their payments match
//
// After setting enrolleeType, recalculates totalTuition based on:
// - Their grade + enrolleeType + paymentOption
// - Minus any existing discounts
// - Regenerates pending payments for remaining balance
//
// Run with: node migrate-enrollee-type.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
    require('dotenv').config();
}
const mongoose = require('mongoose');
const Student = require('./models/Student');
const { TUITION_TABLE, MONTHLY_SCHEDULES, generatePayments } = require('./config/tuition');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to database');

        const students = await Student.find({});
        let updatedCount = 0;

        for (const student of students) {
            const grade = student.grade;
            if (!grade) {
                console.log(`SKIP: ${student.fullName} (${student.studentNo}) - no grade set`);
                continue;
            }

            // Step 1: Determine enrolleeType if not already set
            let enrolleeType = student.enrolleeType;
            if (!enrolleeType) {
                // Try to infer from existing payment amounts or totalTuition
                const oldData = TUITION_TABLE['old'] && TUITION_TABLE['old'][grade];
                const newData = TUITION_TABLE['new'] && TUITION_TABLE['new'][grade];

                if (oldData && newData) {
                    // Check if their original tuition (before discounts) matches old or new
                    // Look at payment records for monthly amounts to determine
                    const monthlyPayments = student.payments.filter(p =>
                        p.description && p.description.startsWith('Monthly Payment')
                    );

                    if (monthlyPayments.length > 0) {
                        // Check first non-June payment (June is always 3000 for both)
                        const nonJunePayment = monthlyPayments.find(p =>
                            p.originalAmount && p.originalAmount !== 3000
                        ) || monthlyPayments.find(p =>
                            p.amount !== 3000 && p.description && !p.description.includes('June')
                        );

                        if (nonJunePayment) {
                            const amt = nonJunePayment.originalAmount || nonJunePayment.amount;
                            const oldSchedule = MONTHLY_SCHEDULES['old'] && MONTHLY_SCHEDULES['old'][grade];
                            const newSchedule = MONTHLY_SCHEDULES['new'] && MONTHLY_SCHEDULES['new'][grade];

                            if (oldSchedule && Math.abs(amt - oldSchedule[1]) < 10) {
                                enrolleeType = 'old';
                            } else if (newSchedule && Math.abs(amt - newSchedule[1]) < 10) {
                                enrolleeType = 'new';
                            } else {
                                enrolleeType = 'old'; // Default fallback
                            }
                        } else {
                            enrolleeType = 'old';
                        }
                    } else {
                        // No monthly payments - check totalTuition against full/two payment totals
                        const paidTotal = student.payments
                            .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
                            .reduce((sum, p) => sum + p.amount, 0);
                        const discounts = student.payments
                            .filter(p => p.amount < 0)
                            .reduce((sum, p) => sum + Math.abs(p.amount), 0);
                        const originalTotal = (student.totalTuition || 0) + discounts;

                        // Compare with expected totals
                        const oldFull = Math.round(oldData.tuition * 0.97) + oldData.miscTotal;
                        const newFull = Math.round(newData.tuition * 0.97) + newData.miscTotal;
                        const oldTwo = Math.round(oldData.tuition * 1.05) + oldData.miscTotal;
                        const newTwo = Math.round(newData.tuition * 1.05) + newData.miscTotal;

                        if (Math.abs(originalTotal - newFull) < 100 || Math.abs(originalTotal - newTwo) < 100 || Math.abs(originalTotal - newData.grandTotal) < 100) {
                            enrolleeType = 'new';
                        } else {
                            enrolleeType = 'old';
                        }
                    }
                } else if (oldData) {
                    enrolleeType = 'old';
                } else if (newData) {
                    enrolleeType = 'new';
                } else {
                    console.log(`SKIP: ${student.fullName} (${student.studentNo}) - grade "${grade}" not in tuition table`);
                    continue;
                }

                student.enrolleeType = enrolleeType;
            }

            // Step 2: Get correct tuition data
            const gradeData = TUITION_TABLE[enrolleeType] && TUITION_TABLE[enrolleeType][grade];
            if (!gradeData) {
                console.log(`SKIP: ${student.fullName} (${student.studentNo}) - no data for ${enrolleeType}/${grade}`);
                continue;
            }

            const baseTuition = gradeData.tuition;
            const misc = gradeData.miscTotal;
            const paymentOption = student.paymentOption || 'monthly';

            // Step 3: Calculate existing discounts
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
                        flatDiscounts += Math.abs(p.amount);
                    }
                }
            });
            const percentageDiscount = Math.round(baseTuition * (discountPct / 100));
            const totalDiscounts = percentageDiscount + flatDiscounts;

            // Step 4: Calculate correct totalTuition based on payment scheme
            let correctTotal;
            if (paymentOption === 'full') {
                const less3 = Math.round(baseTuition * 0.03);
                correctTotal = baseTuition - less3 + misc - totalDiscounts;
            } else if (paymentOption === 'two_payments') {
                const interest = Math.round(baseTuition * 0.05);
                correctTotal = baseTuition + interest + misc - totalDiscounts;
            } else {
                // Monthly - 7% interest
                const interest = Math.round(baseTuition * 0.07);
                correctTotal = baseTuition + interest + misc - totalDiscounts;
            }

            // Step 5: Calculate what's already paid
            const paidTotal = student.payments
                .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
                .reduce((sum, p) => sum + p.amount, 0);

            // Step 6: Update totalTuition
            const oldTotal = student.totalTuition;
            student.totalTuition = correctTotal;

            // Step 7: Remove pending non-expense payments and regenerate
            student.payments = student.payments.filter(p =>
                p.status === 'paid' || (p.description && p.description.startsWith('[Expense]'))
            );

            const remainingBalance = correctTotal - paidTotal;

            if (remainingBalance > 0) {
                if (paymentOption === 'full') {
                    student.payments.push({
                        date: '2026-06-01',
                        description: `Full Payment (3% discount)`,
                        amount: remainingBalance,
                        originalAmount: remainingBalance,
                        status: 'pending'
                    });
                } else if (paymentOption === 'two_payments') {
                    const half = Math.round(remainingBalance / 2);
                    student.payments.push({
                        date: '2026-06-01',
                        description: 'First Payment (Upon Enrollment)',
                        amount: half,
                        originalAmount: half,
                        status: 'pending'
                    });
                    student.payments.push({
                        date: '2026-12-01',
                        description: 'Second Payment (December 2026)',
                        amount: remainingBalance - half,
                        originalAmount: remainingBalance - half,
                        status: 'pending'
                    });
                } else {
                    // Monthly - distribute across remaining months
                    const months = [
                        { month: '06', name: 'June 2026' },
                        { month: '07', name: 'July 2026' },
                        { month: '08', name: 'August 2026' },
                        { month: '09', name: 'September 2026' },
                        { month: '10', name: 'October 2026' },
                        { month: '11', name: 'November 2026' },
                        { month: '12', name: 'December 2026' }
                    ];

                    // Use the correct monthly schedule from the table
                    const schedules = MONTHLY_SCHEDULES[enrolleeType];
                    const monthlySchedule = schedules ? schedules[grade] : null;

                    if (monthlySchedule) {
                        // Determine which months still need payment based on what's been paid
                        let remainingFromSchedule = remainingBalance;
                        let startMonth = 0;

                        // Find how many months are covered by paid amount
                        let coveredAmount = 0;
                        for (let i = 0; i < 7; i++) {
                            if (coveredAmount + monthlySchedule[i] <= paidTotal + 1) {
                                coveredAmount += monthlySchedule[i];
                                startMonth = i + 1;
                            } else {
                                break;
                            }
                        }

                        if (startMonth >= 7) startMonth = 6; // At least one month

                        // Generate remaining months
                        for (let i = startMonth; i < 7; i++) {
                            const amt = (i === 6) ?
                                remainingFromSchedule - student.payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0) :
                                monthlySchedule[i];

                            // Adjust amounts to fit remaining balance
                            student.payments.push({
                                date: `2026-${months[i].month}-01`,
                                description: `Monthly Payment - ${months[i].name}`,
                                amount: monthlySchedule[i],
                                originalAmount: monthlySchedule[i],
                                status: 'pending'
                            });
                        }

                        // Redistribute evenly if schedule total doesn't match remaining
                        const pendingPayments = student.payments.filter(p => p.status === 'pending' && !p.description.startsWith('[Expense]'));
                        const pendingTotal = pendingPayments.reduce((s, p) => s + p.amount, 0);
                        if (Math.abs(pendingTotal - remainingBalance) > 1 && pendingPayments.length > 0) {
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
                    } else {
                        // Fallback: even distribution
                        const numPayments = 7;
                        const perPayment = Math.floor(remainingBalance / numPayments);
                        let distributed = 0;
                        for (let i = 0; i < numPayments; i++) {
                            const amt = (i === numPayments - 1) ? remainingBalance - distributed : perPayment;
                            student.payments.push({
                                date: `2026-${months[i].month}-01`,
                                description: `Monthly Payment - ${months[i].name}`,
                                amount: amt,
                                originalAmount: amt,
                                status: 'pending'
                            });
                            distributed += amt;
                        }
                    }
                }
            }

            await student.save();
            updatedCount++;
            const changed = oldTotal !== correctTotal ? ` (₱${oldTotal} → ₱${correctTotal})` : '';
            console.log(`✓ ${student.fullName} (${student.studentNo}) - ${enrolleeType}/${grade}/${paymentOption}${changed}`);
        }

        console.log(`\nMigration complete! Updated ${updatedCount} of ${students.length} students.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

migrate();
