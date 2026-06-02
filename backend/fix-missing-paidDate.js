/**
 * Fix Missing paidDate Script
 * 
 * Finds all payments where status is 'paid' but paidDate is null/missing,
 * and sets paidDate to the payment's scheduled date.
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
                if (payment.status === 'paid' && !payment.paidDate) {
                    payment.paidDate = payment.date || new Date().toISOString().split('T')[0];
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
