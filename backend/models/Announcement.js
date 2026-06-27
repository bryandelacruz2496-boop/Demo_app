const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    author: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], required: true },
    message: { type: String, required: true },
    parentReplyId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { timestamps: true });

const announcementSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    body: { type: String, required: true },
    targetGrade: { type: String, default: 'all' },
    createdBy: String,
    status: { type: String, enum: ['active', 'done'], default: 'active' },
    replies: [replySchema]
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
