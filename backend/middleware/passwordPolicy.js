/**
 * Password policy enforcement
 * Requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */

function validatePassword(password) {
    const errors = [];

    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least 1 uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least 1 lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least 1 number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least 1 special character');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Express middleware to validate password in request body
 */
function passwordPolicyMiddleware(req, res, next) {
    const { password } = req.body;
    if (!password) return next();

    const result = validatePassword(password);
    if (!result.valid) {
        return res.status(400).json({
            message: 'Password does not meet requirements',
            errors: result.errors
        });
    }
    next();
}

module.exports = { validatePassword, passwordPolicyMiddleware };
