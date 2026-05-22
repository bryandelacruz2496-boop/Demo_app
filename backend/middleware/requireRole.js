/**
 * Role-based access control middleware
 * Usage: requireRole('superadmin') or requireRole('superadmin', 'admin')
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.admin || !req.admin.role) {
            return res.status(403).json({ message: 'Access denied. No role assigned.' });
        }

        if (!allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }

        next();
    };
}

module.exports = requireRole;
