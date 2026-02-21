// src/lib/validation.ts

/**
 * Input Validation Utilities
 * Provides XSS protection and input sanitization
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS attacks
 * Uses DOMPurify instead of regex (S3 fix: regex-based sanitization is inherently bypassable)
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
      'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'style', 'class',
      'src', 'alt', 'width', 'height',
    ],
    ALLOW_DATA_ATTR: false,
  });
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