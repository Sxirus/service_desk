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

    console.log('[AVATARS] Creating signed URL for:', {
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
        console.warn('[AVATARS] Unauthorized access attempt:', {
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
        console.error('[AVATARS] Error creating signed URL:', error.message);
        return res.status(500).json({ 
          error: 'Server Error',
          message: error.message 
        });
      }

      console.log('[AVATARS] Signed URL created successfully for:', path);
      return res.json({ success: true, signedUrl: data.signedUrl });

    } catch (err) {
      console.error('[AVATARS] Server error:', err.message);
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

    console.log('[AVATARS] Creating batch signed URLs:', {
      count: paths.length,
      requestedBy: req.user.employee_id,
      clientId: req.user.client_id
    });

    try {
      const urls = {};
      const errors = [];

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

        // Generate signed URL
        const { data, error } = await supabase
          .storage
          .from('avatars')
          .createSignedUrl(path, 60 * 60);

        if (error) {
          errors.push({ path, error: error.message });
          continue;
        }

        urls[path] = data.signedUrl;
      }

      if (errors.length > 0) {
        console.warn('[AVATARS] Some URLs failed to generate:', errors);
      }

      console.log('[AVATARS] Batch signed URLs created:', {
        successful: Object.keys(urls).length,
        failed: errors.length
      });

      return res.json({ 
        success: true, 
        urls,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (err) {
      console.error('[AVATARS] Server error:', err.message);
      return res.status(500).json({ 
        error: 'Server Error',
        message: err.message 
      });
    }
  }
);

module.exports = router;
