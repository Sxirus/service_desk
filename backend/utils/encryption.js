const crypto = require('node:crypto');
const logger = require('./logger');

// The algorithm to use for encryption
const ALGORITHM = 'aes-256-gcm';
// Length of the initialization vector
const IV_LENGTH = 12;
// Length of the authentication tag
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment variables
 * @returns {Buffer} The 32-byte encryption key
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_SECRET;
    if (!key) {
        throw new Error('ENCRYPTION_SECRET environment variable is not set');
    }
    
    // Key must be 32 bytes (256 bits)
    // If it's a hex string (64 chars), convert it to Buffer
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
        return Buffer.from(key, 'hex');
    }
    
    // If it's a regular string, hash it to ensure it's exactly 32 bytes
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} text - The plaintext to encrypt
 * @returns {string} The encrypted string in format iv:authTag:encryptedData
 */
function encrypt(text) {
    if (!text) return text;
    
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag().toString('base64');
        
        // Return format: iv:authTag:encryptedData
        return `${iv.toString('base64')}:${authTag}:${encrypted}`;
    } catch (error) {
        logger.error('[Encryption] Encryption failed', { error: error.message });
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {string} encryptedText - The encrypted string in format iv:authTag:encryptedData
 * @returns {string} The decrypted plaintext
 */
function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    
    // Check if the text is in our encrypted format (contains exactly two colons)
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        // Log warning for legacy plaintext data
        logger.warn('[Encryption] Data is not encrypted or in wrong format, returning as-is');
        return encryptedText;
    }
    
    try {
        const key = getEncryptionKey();
        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const encryptedData = parts[2];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error('[Encryption] Decryption failed', { error: error.message });
        // If decryption fails, it might be that the text just happens to contain two colons but isn't encrypted
        // or the key is wrong. In a strict environment, we should throw an error.
        // For the migration phase, we return as-is or throw depending on strictness.
        throw new Error('Decryption failed - possibly invalid key or tampered data');
    }
}

module.exports = {
    encrypt,
    decrypt
};
