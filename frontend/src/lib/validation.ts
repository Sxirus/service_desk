// src/lib/validation.ts

/**
 * Input Validation Utilities
 * Provides XSS protection and input sanitization
 */

/**
 * Sanitize HTML to prevent XSS attacks
 * Removes dangerous tags and attributes
 */
export function sanitizeHtml(input: string): string {
  // Remove script tags
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  return sanitized;
}

/**
 * Validate email signature
 * @param signature - The signature to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validateEmailSignature(signature: string): {
  isValid: boolean;
  error?: string;
  sanitized?: string;
} {
  // Check length
  if (signature.length > 5000) {
    return {
      isValid: false,
      error: 'Signature must be less than 5000 characters'
    };
  }

  // Sanitize for XSS
  const sanitized = sanitizeHtml(signature);

  // Check if sanitization removed dangerous content
  if (sanitized.length < signature.length * 0.5 && signature.length > 100) {
    // If more than 50% was removed, likely an attack attempt
    return {
      isValid: false,
      error: 'Signature contains invalid or dangerous content'
    };
  }

  return {
    isValid: true,
    sanitized
  };
}

/**
 * Validate general text input
 */
export function validateTextInput(
  input: string,
  maxLength: number = 1000,
  allowHtml: boolean = false
): {
  isValid: boolean;
  error?: string;
  sanitized?: string;
} {
  if (input.length > maxLength) {
    return {
      isValid: false,
      error: `Input must be less than ${maxLength} characters`
    };
  }

  const sanitized = allowHtml ? sanitizeHtml(input) : input;

  return {
    isValid: true,
    sanitized
  };
}