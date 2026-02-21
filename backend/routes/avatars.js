/**
 * Avatar Routes - SECURED
 * Handles avatar-related operations: signed URL generation
 * 
 * All routes protected with authentication
 * Avatars are stored in a private bucket and require signed URLs for access
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Get signed URL for an avatar
 * POST /api/avatars/getSignedUrl
 * 
 * Authentication: Required
 * Authorization: Only allows access to avatars within the same client
 * Body: { path: string } - The storage path of the avatar
 * 
 * Returns: { success: true, signedUrl: string }
 */
router.post('/getSignedUrl',
  authenticate,
  async (req, res) => {
    const { path } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Avatar path is required' 
      });
    }

    logger.info('[AVATARS] Creating signed URL for:', {
      path: path,
      requestedBy: req.user.employee_id,
      clientId: req.user.client_id
    });

    try {
      // Security check: Verify the avatar path belongs to the same client
      // Avatar paths are structured as: {client_id}/{employee_id}/avatar.webp
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid avatar path format' 
        });
      }

      const pathClientId = parseInt(pathParts[0], 10);
      
      // Only allow access to avatars within the same client
      if (pathClientId !== req.user.client_id) {
        logger.warn('[AVATARS] Unauthorized access attempt:', {
          requestedClientId: pathClientId,
          userClientId: req.user.client_id,
          userId: req.user.employee_id
        });
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'Access denied to this avatar' 
        });
      }

      // Generate signed URL with 1 hour expiry
      const { data, error } = await supabase
        .storage
        .from('avatars')
        .createSignedUrl(path, 60 * 60); // 1 hour expiry

      if (error) {
        logger.error('[AVATARS] Error creating signed URL:', error.message);
        return res.status(500).json({ 
          error: 'Server Error',
          message: error.message 
        });
      }

      logger.info('[AVATARS] Signed URL created successfully for:', path);
      return res.json({ success: true, signedUrl: data.signedUrl });

    } catch (err) {
      logger.error('[AVATARS] Server error:', err.message);
      return res.status(500).json({ 
        error: 'Server Error',
        message: err.message 
      });
    }
  }
);

/**
 * Get signed URLs for multiple avatars (batch)
 * POST /api/avatars/getSignedUrls
 * 
 * Authentication: Required
 * Authorization: Only returns URLs for avatars within the same client
 * Body: { paths: string[] } - Array of avatar storage paths
 * 
 * Returns: { success: true, urls: { [path: string]: string } }
 */
router.post('/getSignedUrls',
  authenticate,
  async (req, res) => {
    const { paths } = req.body;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Avatar paths array is required' 
      });
    }

    // Limit batch size to prevent abuse
    if (paths.length > 50) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Maximum 50 paths allowed per request' 
      });
    }

    logger.info('[AVATARS] Creating batch signed URLs:', {
      count: paths.length,
      requestedBy: req.user.employee_id,
      clientId: req.user.client_id
    });

    try {
      const errors = [];

      // First, validate all paths and filter valid ones
      const validPaths = [];
      for (const path of paths) {
        if (!path || typeof path !== 'string') {
          continue;
        }

        // Security check: Verify the avatar path belongs to the same client
        const pathParts = path.split('/');
        if (pathParts.length < 2) {
          errors.push({ path, error: 'Invalid path format' });
          continue;
        }

        const pathClientId = parseInt(pathParts[0], 10);
        
        if (pathClientId !== req.user.client_id) {
          errors.push({ path, error: 'Access denied' });
          continue;
        }

        validPaths.push(path);
      }

      // Generate signed URLs in parallel for better performance
      const results = await Promise.all(
        validPaths.map(async (path) => {
          const { data, error } = await supabase
            .storage
            .from('avatars')
            .createSignedUrl(path, 60 * 60);
          
          return { path, url: data?.signedUrl, error };
        })
      );

      // Build urls object and collect errors
      const urls = {};
      for (const result of results) {
        if (result.error) {
          errors.push({ path: result.path, error: result.error.message || result.error });
        } else if (result.url) {
          urls[result.path] = result.url;
        }
      }

      if (errors.length > 0) {
        logger.warn('[AVATARS] Some URLs failed to generate:', errors);
      }

      logger.info('[AVATARS] Batch signed URLs created:', {
        successful: Object.keys(urls).length,
        failed: errors.length
      });

      return res.json({ 
        success: true, 
        urls,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (err) {
      logger.error('[AVATARS] Server error:', err.message);
      return res.status(500).json({ 
        error: 'Server Error',
        message: err.message 
      });
    }
  }
);

module.exports = router;
