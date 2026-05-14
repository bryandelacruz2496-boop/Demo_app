const mongoose = require('mongoose');

const schoolEventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    type: { type: String, enum: ['Exam', 'Holiday', 'Field Trip', 'Event', 'Meeting'], required: true },
    description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('SchoolEvent', schoolEventSchema);
