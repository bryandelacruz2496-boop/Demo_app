const jwt = require('jsonwebtoken');

/**
 * Auth middleware - supports both httpOnly cookies and Authorization header
 * Priority: Cookie > Header (cookies are more secure)
 */
const authMiddleware = (req, res, next) => {
    // Try cookie first (more secure)
    let token = req.cookies?.accessToken;

    // Fall back to Authorization header (backward compatibility)
    if (!token) {
        token = req.header('Authorization')?.replace('Bearer ', '');
    }

    if (!token) {
        return res.status(401).json({ message: 'No token, access denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired', expired: true });
        }
        res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = authMiddleware;
