const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encryptionPlugin } = require('../middleware/encryption');

const paymentSchema = new mongoose.Schema({
    date: String,
    description: String,
    amount: Number,
    status: { type: String, enum: ['paid', 'pending'], default: 'pending' },
    paidDate: { type: String, default: null }
});

const activitySchema = new mongoose.Schema({
    title: String,
    date: String,
    subject: String,
    description: String,
    imageUrl: { type: String, default: null }
});

const projectSchema = new mongoose.Schema({
    title: String,
    subject: String,
    dueDate: String,
    description: String,
    grade: { type: String, default: null }
});

const assessmentSchema = new mongoose.Schema({
    subject: String,
    q1: { type: String, default: null },
    q2: { type: String, default: null },
    q3: { type: String, default: null },
    q4: { type: String, default: null }
});

const attendanceSchema = new mongoose.Schema({
    date: { type: String, required: true },
    status: { type: String, enum: ['P', 'L', 'E', 'U'], default: 'P' }
    // P = Present, L = Late, E = Excused, U = Unexcused
});

const studentSchema = new mongoose.Schema({
    studentNo: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    grade: String,
    guardian: String,
    guardianContact: String,
    address: String,
    birthDate: String,
    gender: String,
    profileImage: { type: String, default: null },
    totalTuition: { type: Number, default: 0 },
    paymentOption: { type: String, enum: ['monthly', 'quarterly', 'full', 'two_payments'], default: 'monthly' },
    activeToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    payments: [paymentSchema],
    activities: [activitySchema],
    projects: [projectSchema],
    assessments: [assessmentSchema],
    attendance: [attendanceSchema],
    notifications: [{
        message: String,
        type: { type: String, default: 'general' },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Encrypt sensitive PII fields
studentSchema.plugin(encryptionPlugin, {
    fields: ['guardianContact', 'address', 'birthDate']
});

studentSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

studentSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Student', studentSchema);
