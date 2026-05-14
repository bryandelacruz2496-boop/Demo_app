const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
    childName: { type: String, required: true },
    email: { type: String, required: true },
    contact: { type: String, required: true },
    gradeLevel: { type: String },
    message: { type: String },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new' }
}, { timestamps: true });

module.exports = mongoose.model('Inquiry', inquirySchema);
