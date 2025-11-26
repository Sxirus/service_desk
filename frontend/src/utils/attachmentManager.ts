/**
 * Attachment Manager Utility
 * 
 * Handles file attachments for emails including:
 * - File upload and preview
 * - Signed URL generation for viewing attachments
 * - Memory-safe object URL management
 * - Download functionality
 */

import { apiClient } from './api';
import type { EmailAttachment, FileUploadState } from '@/types/ticket.types';

/**
 * Generates a signed URL for viewing or downloading an attachment
 * 
 * @param path - Storage path of the attachment
 * @param location - Storage bucket ('mail-attachments' or 'sent-attachments')
 * @returns Signed URL string
 * @throws Error if URL generation fails
 */
export async function getAttachmentSignedUrl(
  path: string,
  location: 'mail-attachments' | 'sent-attachments'
): Promise<string> {
  if (!path || !path.trim()) {
    throw new Error('Attachment path is required');
  }

  try {
    const url = await apiClient.post('/emails/getSignedUrl', {
      path: path.trim(),
      location
    });

    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL returned from server');
    }

    return url;
  } catch (error) {
    console.error('[AttachmentManager] Failed to get signed URL:', error);
    throw new Error('Failed to load attachment. Please try again.');
  }
}

/**
 * Downloads an attachment to the user's device
 * 
 * @param signedUrl - Signed URL to download from
 * @param filename - Desired filename for download
 * @throws Error if download fails
 */
export async function downloadAttachment(
  signedUrl: string,
  filename: string
): Promise<void> {
  try {
    const response = await fetch(signedUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Create temporary download link
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Clean up blob URL after download
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('[AttachmentManager] Download failed:', error);
    throw new Error('Failed to download attachment. Please try again.');
  }
}

/**
 * Checks if a MIME type is an image
 * 
 * @param mimeType - MIME type string
 * @returns True if the MIME type is an image
 */
export function isImageMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

/**
 * Formats file size for display
 * 
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Validates file before upload
 * 
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in megabytes (default: 10)
 * @returns Validation result with error message if invalid
 */
export function validateFile(
  file: File,
  maxSizeMB: number = 10
): { valid: boolean; error?: string } {
  const maxBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds ${maxSizeMB}MB limit`
    };
  }

  // MIME type whitelist validation
  const allowedTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Text
    'text/plain',
    'text/csv',
    'text/html',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type || 'unknown'}" is not allowed for "${file.name}"`
    };
  }

  return { valid: true };
}

/**
 * File Upload Manager Class
 * Manages multiple file uploads with memory-safe object URLs
 */
export class FileUploadManager {
  private files: FileUploadState[] = [];
  private objectURLs: string[] = [];

  /**
   * Adds files to the upload queue
   * 
   * @param files - Files to add
   * @returns Array of validation errors (empty if all valid)
   */
  addFiles(files: File[]): string[] {
    const errors: string[] = [];

    files.forEach(file => {
      const validation = validateFile(file);
      
      if (!validation.valid) {
        errors.push(validation.error!);
        return;
      }

      const objectURL = URL.createObjectURL(file);
      this.objectURLs.push(objectURL);
      
      this.files.push({
        file,
        objectURL,
        uploadProgress: 0
      });
    });

    return errors;
  }

  /**
   * Removes a file from the upload queue
   * 
   * @param index - Index of file to remove
   */
  removeFile(index: number): void {
    if (index < 0 || index >= this.files.length) return;

    const fileState = this.files[index];
    
    // Revoke object URL to free memory
    URL.revokeObjectURL(fileState.objectURL);
    
    // Remove from tracking arrays
    const urlIndex = this.objectURLs.indexOf(fileState.objectURL);
    if (urlIndex > -1) {
      this.objectURLs.splice(urlIndex, 1);
    }
    
    this.files.splice(index, 1);
  }

  /**
   * Gets all files in the queue
   */
  getFiles(): File[] {
    return this.files.map(f => f.file);
  }

  /**
   * Gets file upload states (includes object URLs for preview)
   */
  getFileStates(): FileUploadState[] {
    return this.files;
  }

  /**
   * Clears all files and revokes all object URLs
   * Call this after successful upload or on component unmount
   */
  clear(): void {
    this.objectURLs.forEach(url => URL.revokeObjectURL(url));
    this.objectURLs = [];
    this.files = [];
  }

  /**
   * Gets the number of files in the queue
   */
  getCount(): number {
    return this.files.length;
  }
}
