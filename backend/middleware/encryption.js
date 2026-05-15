// Field-level encryption for sensitive PII data
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    // Ensure key is 32 bytes (256 bits)
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a plaintext string
 * Returns format: iv:encrypted:authTag (all hex encoded)
 */
function encrypt(text) {
    if (!text) return text;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt an encrypted string
 * Expects format: iv:encrypted:authTag (all hex encoded)
 */
function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    // If it doesn't look encrypted (no colons), return as-is (legacy data)
    if (!encryptedText.includes(':')) return encryptedText;

    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return encryptedText;

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        // If decryption fails, return original (might be unencrypted legacy data)
        return encryptedText;
    }
}

/**
 * Mongoose plugin to auto-encrypt/decrypt specified fields
 */
function encryptionPlugin(schema, options) {
    const fields = options.fields || [];

    // Encrypt before save
    schema.pre('save', function (next) {
        fields.forEach(field => {
            if (this.isModified(field) && this[field]) {
                // Only encrypt if not already encrypted
                if (!this[field].includes(':') || this[field].split(':').length !== 3) {
                    this[field] = encrypt(this[field]);
                }
            }
        });
        next();
    });

    // Decrypt after find
    schema.post('find', function (docs) {
        docs.forEach(doc => {
            fields.forEach(field => {
                if (doc[field]) {
                    doc[field] = decrypt(doc[field]);
                }
            });
        });
    });

    schema.post('findOne', function (doc) {
        if (!doc) return;
        fields.forEach(field => {
            if (doc[field]) {
                doc[field] = decrypt(doc[field]);
            }
        });
    });

    schema.post('findOneAndUpdate', function (doc) {
        if (!doc) return;
        fields.forEach(field => {
            if (doc[field]) {
                doc[field] = decrypt(doc[field]);
            }
        });
    });

    // Add decrypt method to schema
    schema.methods.decryptFields = function () {
        fields.forEach(field => {
            if (this[field]) {
                this[field] = decrypt(this[field]);
            }
        });
        return this;
    };
}

module.exports = { encrypt, decrypt, encryptionPlugin };
