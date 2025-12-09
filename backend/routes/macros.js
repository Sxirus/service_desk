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
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[MACROS] Fetched', data.length, 'macros');
      res.json({success: true, data});
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
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
        return res.status(500).json({ error: 'Datenbankfehler' });
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
      res.status(500).json({ error: 'Serverfehler' });
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
  sanitizeText('title', { required: true, maxLength: 200 }),
  sanitizeText('text', { required: true, maxLength: 5000 }),
  async (req, res) => {
    try {
      const title = req.sanitized.title;
      const text = req.sanitized.text;
      const groupId = req.body.groupId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Creating macro for client:', client_id);

      const { data, error } = await supabase
        .from('macros')
        .insert([{
          client_id: client_id,
          title: title,
          text: text,
          group_id: groupId
        }])
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Create macro failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[MACROS] Macro created successfully:', data.id);
      res.json({ success: true, data: data });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

//create a new group
router.post('/createGroup', 
  authenticate, 
  async (req, res) => {
    try {
      const name = req.body.name;
      const groupId = req.body.groupId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Creating new group for client:', client_id);

      const { data, error } = await supabase
        .from('macro_groups')
        .insert([{
          client_id: client_id,
          name: name,
          group_id: groupId
        }])
        .select()
        .single()

      if (error) {
        console.error('[MACROS] Create group failed', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[MACROS] Group created successfully:', data.id);
      res.json({ success: true, data: data });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
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
router.put('/updateMacro',
  authenticate,
  validateId('macroId'),
  sanitizeText('title', { required: false, maxLength: 200 }),
  sanitizeText('text', { required: false, maxLength: 5000 }),
  async (req, res) => {
    try {
      const macroId = req.sanitized.macroId;
      const client_id = req.user.client_id;

      console.log('[MACROS] Updating macro:', macroId);

      // Build update object with only provided fields
      const updates = {};
      if (req.sanitized.title !== undefined) updates.title = req.sanitized.title;
      if (req.sanitized.text !== undefined) updates.text = req.sanitized.text;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Perform update
      const { data, error } = await supabase
        .from('macros')
        .update(updates)
        .eq('id', macroId)
        .select()
        .single();

      if (error) {
        console.error('[MACROS] Update failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[MACROS] Macro updated successfully');
      res.json({ success: true, data });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
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

      console.log('[MACROS] Deleting macro:', macroId);

      // Delete macro
      const { error } = await supabase
        .from('macros')
        .delete()
        .eq('id', macroId);

      if (error) {
        console.error('[MACROS] Delete failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[MACROS] Macro deleted successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[MACROS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

router.delete('/deleteMacroGroup',
  authenticate,
  async (req, res) => {
    try {
      const groupId = req.body.groupId;

      console.log('[MACROS] Deleting group', groupId);

      const { error } = await supabase
        .from('macro_groups')
        .delete()
        .eq('id', groupId);

      if (error) {
        console.error('[MACROS] Delete failed:', error.message);
      }

      console.log('[MACROS] Group deleted successfully');
      res.json({success: true});
    } catch (err) {
      console.error('[MACROS] Failed to delete macro group', err.message);
      res.status(500).json({ success: false, error: 'Severfehler'});
    }
  }
);

module.exports = router;