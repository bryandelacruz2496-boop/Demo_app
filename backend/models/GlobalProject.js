const mongoose = require('mongoose');

const globalProjectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    dueDate: { type: String, required: true },
    description: { type: String, required: true },
    targetGrade: { type: String, default: 'all' },
    createdBy: String
}, { timestamps: true });

module.exports = mongoose.model('GlobalProject', globalProjectSchema);
