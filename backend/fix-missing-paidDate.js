/**
 * Fix Missing paidDate Script
 * 
 * Finds all payments where:
 * 1. status is 'paid' but paidDate is null/missing
 * 2. status is 'pending' but amount is 0 (fully paid students with ghost entries)
 * 
 * Sets paidDate and marks zero-amount pending entries as paid.
 * 
 * Usage: node fix-missing-paidDate.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function fixMissingPaidDates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to database');

        const students = await Student.find({});
        let totalFixed = 0;
        let affectedStudents = [];

        for (const student of students) {
            let studentFixed = 0;

            for (const payment of student.payments) {
                // Fix paid payments missing paidDate
                if (payment.status === 'paid' && !payment.paidDate) {
                    payment.paidDate = payment.date || new Date().toISOString().split('T')[0];
                    studentFixed++;
                }

                // Fix zero-amount pending entries (student already fully paid)
                if (payment.status === 'pending' && payment.amount === 0) {
                    payment.status = 'paid';
                    payment.paidDate = payment.paidDate || payment.date || new Date().toISOString().split('T')[0];
                    studentFixed++;
                }
            }

            if (studentFixed > 0) {
                await student.save();
                totalFixed += studentFixed;
                affectedStudents.push({
                    name: student.fullName,
                    studentNo: student.studentNo,
                    fixedCount: studentFixed
                });
                console.log(`Fixed ${studentFixed} payment(s) for ${student.fullName} (${student.studentNo})`);
            }
        }

        console.log('\n--- Summary ---');
        console.log(`Total students affected: ${affectedStudents.length}`);
        console.log(`Total payments fixed: ${totalFixed}`);

        if (affectedStudents.length === 0) {
            console.log('No records needed fixing.');
        }

        await mongoose.disconnect();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

fixMissingPaidDates();
