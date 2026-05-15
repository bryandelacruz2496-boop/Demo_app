// File encryption for uploaded images
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getFileEncryptionKey() {
    const key = process.env.FILE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('FILE_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable is required');
    }
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a file after upload
 * Reads the file, encrypts it, writes back encrypted version
 */
function encryptFile(filePath) {
    try {
        const key = getFileEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const fileData = fs.readFileSync(filePath);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(fileData), cipher.final()]);

        // Write IV + encrypted data
        const output = Buffer.concat([iv, encrypted]);
        fs.writeFileSync(filePath + '.enc', output);

        // Remove original unencrypted file
        fs.unlinkSync(filePath);

        return filePath + '.enc';
    } catch (err) {
        console.error('File encryption error:', err.message);
        return filePath; // Return original path if encryption fails
    }
}

/**
 * Decrypt a file and return the buffer
 */
function decryptFile(encryptedFilePath) {
    try {
        const key = getFileEncryptionKey();
        const fileData = fs.readFileSync(encryptedFilePath);

        // First 16 bytes are the IV
        const iv = fileData.slice(0, IV_LENGTH);
        const encrypted = fileData.slice(IV_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

        return decrypted;
    } catch (err) {
        console.error('File decryption error:', err.message);
        return null;
    }
}

/**
 * Express middleware to serve encrypted files
 */
function serveEncryptedFile(req, res, next) {
    const filePath = path.join(__dirname, '..', 'uploads', req.params[0]);

    // Try encrypted version first
    const encPath = filePath + '.enc';
    if (fs.existsSync(encPath)) {
        const decrypted = decryptFile(encPath);
        if (decrypted) {
            // Detect content type from extension
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.send(decrypted);
        }
    }

    // Fall back to unencrypted file (legacy uploads)
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }

    res.status(404).json({ message: 'File not found' });
}

/**
 * Multer post-processing middleware to encrypt uploaded files
 */
function encryptUploadedFile(req, res, next) {
    if (req.file) {
        const originalPath = req.file.path;
        const encryptedPath = encryptFile(originalPath);
        // Update the file info to reflect encrypted path
        req.file.path = encryptedPath;
        req.file.filename = req.file.filename + '.enc';
    }
    next();
}

module.exports = { encryptFile, decryptFile, serveEncryptedFile, encryptUploadedFile };
