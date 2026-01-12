import crypto from 'node:crypto';

// The algorithm to use for encryption
const ALGORITHM = 'aes-256-gcm';
// Length of the initialization vector
const IV_LENGTH = 12;

/**
 * Get the encryption key from environment variables
 * @returns {Buffer} The 32-byte encryption key
 */
function getEncryptionKey(): Buffer {
    // In Astro, server-side env vars are available via import.meta.env
    // or process.env depending on the adapter.
    // For Astro actions, they should be available.
    const key = process.env.ENCRYPTION_SECRET || import.meta.env.ENCRYPTION_SECRET;
    
    if (!key) {
        throw new Error('ENCRYPTION_SECRET environment variable is not set');
    }
    
    // Key must be 32 bytes (256 bits)
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
        return Buffer.from(key, 'hex');
    }
    
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} text - The plaintext to encrypt
 * @returns {string} The encrypted string in format iv:authTag:encryptedData
 */
export function encrypt(text: string): string {
    if (!text) return text;
    
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag().toString('base64');
        
        return `${iv.toString('base64')}:${authTag}:${encrypted}`;
    } catch (error: any) {
        console.error('[Encryption] Encryption failed:', error.message);
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {string} encryptedText - The encrypted string in format iv:authTag:encryptedData
 * @returns {string} The decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        console.warn('[Encryption] Data is not encrypted or in wrong format, returning as-is');
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
    } catch (error: any) {
        console.error('[Encryption] Decryption failed:', error.message);
        throw new Error('Decryption failed');
    }
}
