/**
 * Macros Routes - SECURED
 * Handles macro templates for quick responses
 * 
 * All routes protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { validateId, sanitizeText } = require('../middleware/validation');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const {storeMacroAttachmentsInDB, deleteAttachmentsFromStorage} = require("../services/attachments/macroAttachments")

/**
 * Get all macros for authenticated user's client
 * GET /api/macros/getMacros
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getMacros',
  authenticate,
  async (req, res) => {
    try {
      // Use client_id from authenticated user (secure - can't be spoofed)
      const client_id = req.user.client_id;

      console.log('[MACROS] Fetching macros for client:', client_id);

      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .eq("client_id", client_id)
        .order('title');

      if (error) {
        console.error('[MACROS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[MACROS] Fetched', data.length, 'macros');
      res.json({success: true, data});
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Get a single macro by ID
 * GET /api/macros/getMacro?macroId=123
 * 
 * Authentication: Required
 * Authorization: Macro must belong to user's client
 */
router.get('/getMacro',
  authenticate,
  validateId('macroId'),
  async (req, res) => {
    try {
      const macroId = req.sanitized.macroId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Fetching macro:', macroId);

      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .eq('id', macroId)
        .single();

      if (error) {
        console.error('[MACROS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        console.warn('[MACROS] Macro not found:', macroId);
        return res.status(404).json({ error: 'Macro not found' });
      }

      // Verify macro belongs to user's client
      if (data.client_id !== client_id) {
        console.warn('[MACROS] Unauthorized access attempt:', {
          macro_id: macroId,
          macro_client_id: data.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this macro' });
      }

      console.log('[MACROS] Macro fetched successfully');
      res.json({success: true, data});
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Create a new macro
 * POST /api/macros/createMacro
 * Body: { title, text }
 * 
 * Authentication: Required
 * Authorization: Creates macro for user's client
 */
router.post('/createMacro',
  authenticate,
  upload.array('attachments'),
  sanitizeText('title', { required: true, maxLength: 200 }),
  sanitizeText('text', { required: true, maxLength: 5000 }),
  async (req, res) => {
    try {
      const title = req.sanitized.title;
      const text = req.sanitized.text;
      console.log(req.body.groupId);
      const groupId = parseInt(req.body.groupId) || null;
      const client_id = req.user.client_id;
      const attachments = req.files || [];
      console.log(attachments, title, text, groupId);

      console.log('[MACROS] Creating macro for client:', client_id);

      // Validate groupId belongs to client if provided
      if (groupId) {
        const parsedGroupId = parseInt(groupId, 10);
        if (isNaN(parsedGroupId)) {
          return res.status(400).json({ error: 'Invalid group ID format' });
        }
        const { data: group, error: groupError } = await supabase
          .from('macro_groups')
          .select('client_id')
          .eq('id', parsedGroupId)
          .single();

        if (groupError || !group || group.client_id !== client_id) {
          return res.status(403).json({ error: 'Access denied to this macro group' });
        }
      }

      const { data, error } = await supabase
        .from('macros')
        .insert([{
          client_id: client_id,
          title: title,
          text: text,
          group_id: groupId || null
        }])
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Create macro failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (attachments.length > 0) {
        console.log('[MACROS] Saving attachments');
        storeMacroAttachmentsInDB(attachments, client_id, data.id, null, null);
      } else {
        console.log('[MACROS] No attachments, continue')
      }

      console.log('[MACROS] Macro created successfully:', data.id);
      res.json({ success: true, data: data });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

//create a new group
router.post('/createGroup', 
  authenticate,
  sanitizeText('name', { required: true, maxLength: 100 }),
  async (req, res) => {
    try {
      const name = req.sanitized.name;
      const groupId = req.body.groupId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Creating new group for client:', client_id);

      // Validate parent groupId belongs to client if provided
      if (groupId) {
        const parsedGroupId = parseInt(groupId, 10);
        if (isNaN(parsedGroupId)) {
          return res.status(400).json({ error: 'Invalid group ID format' });
        }
        const { data: parentGroup, error: parentError } = await supabase
          .from('macro_groups')
          .select('client_id')
          .eq('id', parsedGroupId)
          .single();

        if (parentError || !parentGroup || parentGroup.client_id !== client_id) {
          return res.status(403).json({ error: 'Access denied to parent group' });
        }
      }

      const { data, error } = await supabase
        .from('macro_groups')
        .insert([{
          client_id: client_id,
          name: name,
          group_id: groupId || null
        }])
        .select()
        .single()

      if (error) {
        console.error('[MACROS] Create group failed', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[MACROS] Group created successfully:', data.id);
      res.json({ success: true, data: data });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Update an existing macro
 * PUT /api/macros/updateMacro?macroId=123
 * Body: { title, text }
 * 
 * Authentication: Required
 * Authorization: Macro must belong to user's client
 */
router.post('/updateMacro',
  authenticate,
  upload.array('attachments'),
  validateId('macroId'),
  sanitizeText('title', { required: false, maxLength: 200 }),
  sanitizeText('text', { required: false, maxLength: 5000 }),
  async (req, res) => {
    try {
      const macroId = req.sanitized.macroId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Updating macro:', macroId, 'for client:', client_id);

      // Parse attachments data from request body
      const attachments = req.files || [];
      let deletedAttachments = [];
      let oldAttachments = [];
      
      try {
        if (req.body.deletedAttachments) {
          deletedAttachments = JSON.parse(req.body.deletedAttachments);
        }
        if (req.body.oldAttachments) {
          oldAttachments = JSON.parse(req.body.oldAttachments);
        }
      } catch (parseError) {
        console.error('[MACROS] Error parsing attachments data:', parseError.message);
      }

      console.log('[MACROS] Attachments:', { 
        new: attachments.length, 
        deleted: deletedAttachments.length, 
        existing: oldAttachments.length 
      });

      // Build update object with only provided fields
      const updates = {};
      if (req.sanitized.title !== undefined) updates.title = req.sanitized.title;
      if (req.sanitized.text !== undefined) updates.text = req.sanitized.text;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Perform update - include client_id check for security
      const { data, error } = await supabase
        .from('macros')
        .update(updates)
        .eq('id', macroId)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Update failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Macro not found or access denied' });
      }
      
      let result = { success: true, data: data };

      if (attachments.length > 0 || oldAttachments.length > 0 || deletedAttachments.length > 0) {
        const newAttachments = await storeMacroAttachmentsInDB(attachments, req.user.client_id, data.id, deletedAttachments, oldAttachments);
        result.attachments = newAttachments;
      }

      console.log('[MACROS] Macro updated successfully');
      res.json(result);
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Delete a macro
 * DELETE /api/macros/deleteMacro?macroId=123
 * 
 * Authentication: Required
 * Authorization: Macro must belong to user's client
 */
router.delete('/deleteMacro',
  authenticate,
  validateId('macroId'),
  async (req, res) => {
    try {
      const macroId = req.sanitized.macroId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Deleting macro:', macroId, 'for client:', client_id);

      //deleting attachments from database
      const { data: oldAttachments, error: oldAttachmentsError } = await supabase
        .from('macros')
        .select('attachments')
        .eq('id', macroId)
        .single();
      
      if (oldAttachmentsError) {
        console.error('[MACROS] Delete failed:', oldAttachments.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }
      
      if (oldAttachments.attachments != null && oldAttachments.attachments.length > 0) {
        const response = await deleteAttachmentsFromStorage(oldAttachments.attachments);
        if (!response.success) {
          console.error('[MACROS] Delete failed:', response.message);
          return res.status(500).json({ error: 'Datenbankfehler' });
        }
      }

      // Delete macro
      const { error } = await supabase
        .from('macros')
        .delete()
        .eq('id', macroId)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Delete failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Macro not found or access denied' });
      }

      console.log('[MACROS] Macro deleted successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/deleteMacroGroup',
  authenticate,
  async (req, res) => {
    try {
      const groupId = req.body.groupId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Deleting group', groupId, 'for client:', client_id);

      // Delete group - include client_id check for security
      const { data, error } = await supabase
        .from('macro_groups')
        .delete()
        .eq('id', groupId)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Delete failed:', error.message);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ success: false, error: 'Group not found or access denied' });
      }

      console.log('[MACROS] Group deleted successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[MACROS] Failed to delete macro group', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

module.exports = router;