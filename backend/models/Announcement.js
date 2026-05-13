const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    body: { type: String, required: true },
    targetGrade: { type: String, default: 'all' },
    createdBy: String,
    status: { type: String, enum: ['active', 'done'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
