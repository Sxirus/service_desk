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
// S11 fix: add file type filter to reject dangerous executables
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/html',
  'application/zip', 'application/x-zip-compressed',
  'message/rfc822', 'application/octet-stream'
];
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});
const {storeMacroAttachmentsInDB, deleteAttachmentsFromStorage} = require("../services/attachments/macroAttachments")
const { logFromReq, ACTIONS } = require('../services/activityLogger');
const logger = require('../utils/logger');

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

      logger.info('[MACROS] Fetching macros for client', { client_id });

      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .eq("client_id", client_id)
        .order('title');

      if (error) {
        logger.error('[MACROS] Supabase error', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      logger.info('[MACROS] Fetched macros', { count: data.length });
      res.json({success: true, data});
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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

      logger.info('[MACROS] Fetching macro', { macroId });

      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .eq('id', macroId)
        .single();

      if (error) {
        logger.error('[MACROS] Supabase error', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        logger.warn('[MACROS] Macro not found', { macroId });
        return res.status(404).json({ error: 'Macro not found' });
      }

      // Verify macro belongs to user's client
      if (data.client_id !== client_id) {
        logger.warn('[MACROS] Unauthorized access attempt', {
          macro_id: macroId,
          macro_client_id: data.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this macro' });
      }

      logger.info('[MACROS] Macro fetched successfully');
      res.json({success: true, data});
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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
      logger.info('[MACROS] Group ID from request', { groupId: req.body.groupId });
      const groupId = parseInt(req.body.groupId) || null;
      const client_id = req.user.client_id;
      const attachments = req.files || [];
      logger.info('[MACROS] Create macro params', { attachmentCount: attachments.length, title, text, groupId });

      logger.info('[MACROS] Creating macro for client', { client_id });

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
        logger.error('[MACROS] Create macro failed', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      if (attachments.length > 0) {
        logger.info('[MACROS] Saving attachments');
        const updatedMacro = await storeMacroAttachmentsInDB(attachments, client_id, data.id, null, null);
        logger.info('[MACROS] Macro created successfully', { macroId: data.id });
        logFromReq(req, { ...ACTIONS.MACRO_CREATED, targetType: 'macro', targetId: data.id, details: { title } });
        res.json({ success: true, data: updatedMacro || data });
      } else {
        logger.info('[MACROS] No attachments, continue');
        logger.info('[MACROS] Macro created successfully', { macroId: data.id });
        logFromReq(req, { ...ACTIONS.MACRO_CREATED, targetType: 'macro', targetId: data.id, details: { title } });
        res.json({ success: true, data: data });
      }
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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

      logger.info('[MACROS] Creating new group for client', { client_id });

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
        logger.error('[MACROS] Create group failed', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      logger.info('[MACROS] Group created successfully', { groupId: data.id });
      logFromReq(req, { ...ACTIONS.MACRO_CREATED, targetType: 'macro_group', targetId: data.id, details: { name } });
      res.json({ success: true, data: data });
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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
      
      let deletedAttachments = [];
      try {
        deletedAttachments = req.body.deletedAttachments ? JSON.parse(req.body.deletedAttachments) : [];
      } catch (e) {
        logger.error('[MACROS] Failed to parse deletedAttachments', { error: e.message });
      }

      let oldAttachments = [];
      try {
        oldAttachments = req.body.oldAttachments ? JSON.parse(req.body.oldAttachments) : [];
      } catch (e) {
        logger.error('[MACROS] Failed to parse oldAttachments', { error: e.message });
      }

      const attachments = req.files || [];

      logger.info('[MACROS] Updating macro', { macroId, client_id });

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
        logger.error('[MACROS] Update failed', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Macro not found or access denied' });
      }
      
      let result = { success: true, data: data };

      if (attachments.length > 0 || oldAttachments.length > 0 || deletedAttachments.length > 0) {
        const updatedMacro = await storeMacroAttachmentsInDB(attachments, req.user.client_id, data.id, deletedAttachments, oldAttachments);
        result.attachments = updatedMacro?.attachments || [];
      }

      logger.info('[MACROS] Macro updated successfully');
      logFromReq(req, { ...ACTIONS.MACRO_UPDATED, targetType: 'macro', targetId: data.id, details: { title: data.title } });
      res.json(result);
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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

      logger.info('[MACROS] Deleting macro', { macroId, client_id });

      //deleting attachments from database
      const { data: oldAttachments, error: oldAttachmentsError } = await supabase
        .from('macros')
        .select('attachments')
        .eq('id', macroId)
        .single();
      
      if (oldAttachmentsError) {
        logger.error('[MACROS] Delete failed', { error: oldAttachments.message });
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (oldAttachments.attachments != null && oldAttachments.attachments.length > 0) {
        const response = await deleteAttachmentsFromStorage(oldAttachments.attachments);
        if (!response.success) {
          logger.error('[MACROS] Delete failed', { error: response.message });
          return res.status(500).json({ error: 'Database error' });
        }
      }

      // Delete macro
      const { data, error } = await supabase
        .from('macros')
        .delete()
        .eq('id', macroId)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) {
        logger.error('[MACROS] Delete macro failed', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Macro not found or access denied' });
      }

      logger.info('[MACROS] Macro deleted successfully');
      logFromReq(req, { ...ACTIONS.MACRO_DELETED, targetType: 'macro', targetId: macroId });
      res.json({ success: true });
    } catch (err) {
      logger.error('[MACROS] Server error', { error: err.message });
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

      // Validate groupId is a positive integer
      const parsedId = parseInt(groupId, 10);
      if (!groupId || isNaN(parsedId) || parsedId <= 0 || String(parsedId) !== String(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid group ID' });
      }

      logger.info('[MACROS] Deleting group', { groupId, client_id });

      // Delete group - include client_id check for security
      const { data, error } = await supabase
        .from('macro_groups')
        .delete()
        .eq('id', groupId)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) {
        logger.error('[MACROS] Delete group failed', { error: error.message });
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ success: false, error: 'Group not found or access denied' });
      }

      logger.info('[MACROS] Group deleted successfully');
      logFromReq(req, { ...ACTIONS.MACRO_GROUP_DELETED, targetType: 'macro_group', targetId: groupId });
      res.json({ success: true });
    } catch (err) {
      logger.error('[MACROS] Failed to delete macro group', { error: err.message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

module.exports = router;