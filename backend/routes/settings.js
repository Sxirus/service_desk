/**
 * Settings Routes - SECURED
 * Handles client settings like email signatures
 * 
 * All routes protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { sanitizeText, sanitizeHtmlField } = require('../middleware/validation');
const { logFromReq, ACTIONS } = require('../services/activityLogger');

/**
 * Update email signature
 * POST /api/settings/updateSignature
 */
router.post('/updateSignature', 
  authenticate,
  sanitizeHtmlField('signature', { required: false, maxLength: 50000 }),
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const signature = req.sanitized.signature || '';

      console.log('[SETTINGS] Updating email signature for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .update({ email_signature: signature })
        .eq('id', client_id);

      if (error) {
        console.error('[SETTINGS] Error updating signature:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update signature' 
        });
      }

      logFromReq(req, { ...ACTIONS.SETTINGS_SIGNATURE });
      res.json({ success: true });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Update email sending configuration
 * POST /api/settings/updateEmailConfig
 */
router.post('/updateEmailConfig',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { sendingMode, primaryEmailId } = req.body;

      console.log('[SETTINGS] Updating email config for client:', client_id, {
        sendingMode,
        primaryEmailId
      });

      // Validate sending mode
      if (!['primary', 'thread-based'].includes(sendingMode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid sending mode'
        });
      }

      // If primary mode, validate primary email exists and belongs to client
      if (sendingMode === 'primary' && primaryEmailId) {
        const { data: email, error: emailError } = await supabase
          .from('client-emails')
          .select('id, client_id')
          .eq('id', primaryEmailId)
          .eq('client_id', client_id)
          .single();

        if (emailError || !email) {
          return res.status(400).json({
            success: false,
            error: 'Selected email does not exist or does not belong to your client'
          });
        }
      }

      const updateData = {
        email_sending_mode: sendingMode,
        primary_email_id: sendingMode === 'primary' ? primaryEmailId : null
      };

      const { data, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', client_id);

      if (error) {
        console.error('[SETTINGS] Error updating email config:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update email configuration' 
        });
      }

      logFromReq(req, { ...ACTIONS.SETTINGS_EMAIL_CONFIG, details: { sendingMode, primaryEmailId: primaryEmailId || null } });
      res.json({ success: true });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

//updating the confirmation mail sent when a customer sends a mail to the client
router.post('/updateConfirmMail', 
  authenticate,
  sanitizeText('subject', { required: false, maxLength: 500 }),
  sanitizeHtmlField('body', { required: false, maxLength: 100000 }),
  async (req, res) => {
    try {
      const subject = req.sanitized?.subject ?? req.body.subject;
      const body = req.sanitized?.body ?? req.body.body;
      const client_id = req.user.client_id;

      console.log('[SETTINGS] Updating confirmation mail for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .update({
          confirm_mail: body,
          confirmation_mail_subject: subject
        })
        .eq('id', client_id);

      if (error) {
        console.error('[SETTINGS] Confirmation mail update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Confirm mail updated successfully');
      logFromReq(req, { ...ACTIONS.SETTINGS_CONFIRM_MAIL });
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
});

/**
 * Get tracking settings
 * GET /api/settings/tracking
 */
router.get('/tracking', authenticate, async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const { data, error } = await supabase
      .from('clients')
      .select('tracking_settings')
      .eq('id', client_id)
      .single();

    if (error) throw error;

    // Default structure if null
    const settings = data.tracking_settings || { 
      providers: ['17track', 'dhl', 'hermes', 'ups', 'fedex'], 
      customProviders: [] 
    };
    
    res.json({ success: true, settings });
  } catch (err) {
    console.error('[SETTINGS] Error fetching tracking settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update tracking settings
 * POST /api/settings/tracking
 */
router.post('/tracking', authenticate, async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const { providers, customProviders } = req.body;

    // Basic validation
    if (!Array.isArray(providers) || !Array.isArray(customProviders)) {
      return res.status(400).json({ success: false, error: 'Invalid format' });
    }

    const { error } = await supabase
      .from('clients')
      .update({ 
        tracking_settings: { providers, customProviders } 
      })
      .eq('id', client_id);

    if (error) throw error;

    logFromReq(req, { ...ACTIONS.SETTINGS_TRACKING });
    res.json({ success: true });
  } catch (err) {
    console.error('[SETTINGS] Error updating tracking settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get all settings for authenticated user's client
 * GET /api/settings/getAllSettings
 * 
 * Authentication: Required
 * Authorization: Returns only user's client settings
 */
router.get('/getAllSettings',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[SETTINGS] Fetching all settings for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

      if (error) {
        console.error('[SETTINGS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        console.warn('[SETTINGS] Client not found:', client_id);
        return res.status(404).json({ error: 'Client not found' });
      }

      // Remove sensitive fields before sending to client
      const safeData = {
        id: data.id,
        name: data.name,
        address_street: data.address_street,
        address_city: data.address_city,
        address_zip: data.address_zip,
        address_country: data.address_country,
        vat: data.vat,
        website: data.website,
        email_signature: data.email_signature,
        shopify_connected: data.shopify_connected,
        shopify_store_url: data.shopify_store_url,
        // DO NOT send: shopify_access_token, shopify_secret
      };

      console.log('[SETTINGS] Settings fetched successfully');
      res.json({success: true, safeData});
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Update general client settings
 * PUT /api/settings/updateSettings
 * Body: { name?, website?, vat?, address_*? }
 * 
 * Authentication: Required
 * Authorization: Updates only user's own client
 * 
 * Note: Does not allow updating sensitive fields like Shopify credentials
 */
router.put('/updateSettings',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const allowedFields = [
        'name',
        'website',
        'vat',
        'address_street',
        'address_city',
        'address_zip',
        'address_country'
      ];

      console.log('[SETTINGS] Updating settings for client:', client_id);

      // Build update object with only allowed fields
      const updates = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Validate specific fields
      if (updates.website && updates.website.length > 0) {
        // Basic URL validation
        const urlRegex = /^https?:\/\/.+/;
        if (!urlRegex.test(updates.website)) {
          return res.status(400).json({ error: 'Invalid website URL format' });
        }
      }

      if (updates.address_zip && typeof updates.address_zip !== 'number') {
        updates.address_zip = parseInt(updates.address_zip, 10);
        if (isNaN(updates.address_zip)) {
          return res.status(400).json({ error: 'Invalid ZIP code format' });
        }
      }

      // Perform update
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', client_id)
        .select()
        .single();

      if (error) {
        console.error('[SETTINGS] Update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Settings updated successfully');
      logFromReq(req, { ...ACTIONS.SETTINGS_GENERAL, details: { changedFields: Object.keys(updates) } });
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
    }
  }
);

/**
 * Get Shopify connection status
 * GET /api/settings/getShopifyStatus
 * 
 * Authentication: Required
 * Authorization: Returns only user's client Shopify status
 */
router.get('/getShopifyStatus',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[SETTINGS] Fetching Shopify status for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .select('shopify_connected, shopify_store_url, shopify_scope')
        .eq('id', client_id)
        .single();

      if (error) {
        console.error('[SETTINGS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[SETTINGS] Shopify status fetched');
      res.json({
        connected: data.shopify_connected || false,
        store_url: data.shopify_store_url || null,
        scope: data.shopify_scope || null
      });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

//updating the confirmation mail mode setting
router.post('/updateConfirmMailMode',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const mode = req.body.mode;

      const validModes = ['all', 'new_only', 'disabled'];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ success: false, error: 'Invalid mode. Must be one of: all, new_only, disabled' });
      }

      console.log('[SETTINGS] Updating confirmation mail mode for client:', client_id, 'to:', mode);

      const { data, error } = await supabase
        .from('clients')
        .update({ confirmation_mail_mode: mode })
        .eq('id', client_id);

      if (error) {
        console.error('[SETTINGS] Confirmation mail mode update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Confirmation mail mode updated successfully');
      logFromReq(req, { ...ACTIONS.SETTINGS_CONFIRM_MODE, details: { mode } });
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

//updating the setting auto_assign_employee_on_send
router.post('/updateAutoAssignEmployeeOnSend',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const value = req.body.value;

      console.log('[SETTINGS] Updating auto assign employee on send');
      
      const { data, error } = await supabase
        .from('clients')
        .update({auto_assign_employee_on_send: value})
        .eq('id', client_id)

      if (error) {
        console.error('[SETTINGS] auto assign employee on send update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Auto assign employee on send updated successfully');
      logFromReq(req, { ...ACTIONS.SETTINGS_AUTO_ASSIGN, details: { enabled: value } });
      res.json({success: true, data})
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
)

module.exports = router;