const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    details: { type: String },
    targetStudent: { type: String },
    ip: { type: String }
}, { timestamps: true });

// Auto-delete logs after 1 week (7 days)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
