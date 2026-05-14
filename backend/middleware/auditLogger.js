const AuditLog = require('../models/AuditLog');

async function logAction(action, performedBy, details, targetStudent, ip) {
    try {
        await AuditLog.create({ action, performedBy, details, targetStudent, ip });
    } catch (e) {
        console.error('Audit log error:', e.message);
    }
}

module.exports = { logAction };
