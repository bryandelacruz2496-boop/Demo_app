const mongoose = require('mongoose');
require('dotenv').config();
const Student = require('./models/Student');

const students = [
    {
        studentNo: "2026-0001",
        password: "student123",
        fullName: "Juan Dela Cruz",
        grade: "Grade 6 - Section A",
        guardian: "Maria Dela Cruz",
        totalTuition: 45000,
        payments: [
            { date: "2026-06-15", description: "Enrollment Fee", amount: 5000, status: "paid" },
            { date: "2026-07-01", description: "Tuition - July", amount: 5000, status: "paid" },
            { date: "2026-08-01", description: "Tuition - August", amount: 5000, status: "paid" },
            { date: "2026-09-01", description: "Tuition - September", amount: 5000, status: "paid" },
            { date: "2026-10-01", description: "Tuition - October", amount: 5000, status: "paid" },
            { date: "2026-11-01", description: "Tuition - November", amount: 5000, status: "paid" },
            { date: "2026-12-01", description: "Tuition - December", amount: 5000, status: "pending" },
            { date: "2027-01-01", description: "Tuition - January", amount: 5000, status: "pending" },
            { date: "2027-02-01", description: "Tuition - February", amount: 5000, status: "pending" }
        ],
        activities: [
            { title: "Science Fair Project Submission", date: "Oct 15, 2026", subject: "Science", description: "Build a working volcano model with explanation of chemical reactions." },
            { title: "Math Olympiad Practice", date: "Oct 20, 2026", subject: "Math", description: "Complete practice worksheets for the upcoming Math Olympiad competition." },
            { title: "Filipino Essay Writing", date: "Oct 25, 2026", subject: "Filipino", description: "Write a 500-word essay about 'Ang Aking Pangarap'." },
            { title: "Art Contest Entry", date: "Nov 5, 2026", subject: "Arts", description: "Create a poster about environmental awareness using watercolors." },
            { title: "Physical Fitness Test", date: "Nov 10, 2026", subject: "PE", description: "Complete all stations: push-ups, sit-ups, running, and flexibility test." }
        ],
        projects: [
            { title: "Solar System Model", subject: "Science", dueDate: "Nov 15, 2026", description: "Create a 3D model of the solar system with correct planet sizes and distances.", grade: "95" },
            { title: "Philippine History Timeline", subject: "Araling Panlipunan", dueDate: "Nov 20, 2026", description: "Illustrated timeline of major events in Philippine history from 1521-1946.", grade: "92" },
            { title: "Storybook Creation", subject: "English", dueDate: "Dec 1, 2026", description: "Write and illustrate an original children's storybook (minimum 10 pages).", grade: null },
            { title: "Community Garden Plan", subject: "TLE", dueDate: "Dec 10, 2026", description: "Design a community garden layout with plant selection and maintenance schedule.", grade: null }
        ],
        assessments: [
            { subject: "Mathematics", q1: 92, q2: 88, q3: 90, q4: null },
            { subject: "Science", q1: 95, q2: 93, q3: 91, q4: null },
            { subject: "English", q1: 88, q2: 90, q3: 87, q4: null },
            { subject: "Filipino", q1: 91, q2: 89, q3: 92, q4: null },
            { subject: "Araling Panlipunan", q1: 90, q2: 88, q3: 89, q4: null },
            { subject: "MAPEH", q1: 94, q2: 95, q3: 93, q4: null },
            { subject: "TLE", q1: 93, q2: 91, q3: 90, q4: null },
            { subject: "Values Education", q1: 96, q2: 95, q3: 97, q4: null }
        ]
    },
    {
        studentNo: "2026-0002",
        password: "student123",
        fullName: "Maria Santos",
        grade: "Grade 4 - Section B",
        guardian: "Pedro Santos",
        totalTuition: 40000,
        payments: [
            { date: "2026-06-15", description: "Enrollment Fee", amount: 5000, status: "paid" },
            { date: "2026-07-01", description: "Tuition - July", amount: 5000, status: "paid" },
            { date: "2026-08-01", description: "Tuition - August", amount: 5000, status: "paid" },
            { date: "2026-09-01", description: "Tuition - September", amount: 5000, status: "paid" },
            { date: "2026-10-01", description: "Tuition - October", amount: 5000, status: "paid" },
            { date: "2026-11-01", description: "Tuition - November", amount: 5000, status: "pending" },
            { date: "2026-12-01", description: "Tuition - December", amount: 5000, status: "pending" },
            { date: "2027-01-01", description: "Tuition - January", amount: 5000, status: "pending" }
        ],
        activities: [
            { title: "Reading Challenge", date: "Oct 10, 2026", subject: "English", description: "Read 3 books and write a short summary for each." },
            { title: "Multiplication Drill", date: "Oct 18, 2026", subject: "Math", description: "Complete multiplication tables 1-12 speed test." },
            { title: "Nature Walk Report", date: "Oct 22, 2026", subject: "Science", description: "Observe and document 5 different plants found in the school garden." }
        ],
        projects: [
            { title: "My Family Tree", subject: "Araling Panlipunan", dueDate: "Nov 10, 2026", description: "Create a family tree poster going back 3 generations.", grade: "90" },
            { title: "Recycled Art", subject: "Arts", dueDate: "Nov 25, 2026", description: "Create an art piece using only recycled materials.", grade: null }
        ],
        assessments: [
            { subject: "Mathematics", q1: 88, q2: 85, q3: 87, q4: null },
            { subject: "Science", q1: 90, q2: 88, q3: 89, q4: null },
            { subject: "English", q1: 92, q2: 90, q3: 91, q4: null },
            { subject: "Filipino", q1: 89, q2: 87, q3: 90, q4: null },
            { subject: "MAPEH", q1: 93, q2: 94, q3: 92, q4: null },
            { subject: "Values Education", q1: 95, q2: 96, q3: 95, q4: null }
        ]
    }
];

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);

    // Clear existing students
    await Student.deleteMany({});

    // Insert students (password will be hashed by the pre-save hook)
    for (const studentData of students) {
        const student = new Student(studentData);
        await student.save();
        console.log(`Created student: ${student.studentNo} - ${student.fullName}`);
    }

    console.log('\nAll students seeded successfully!');
    console.log('Login credentials:');
    console.log('  2026-0001 / student123');
    console.log('  2026-0002 / student123');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
