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
const { sanitizeText } = require('../middleware/validation');

/**
 * Update email signature for authenticated user's client
 * POST /api/settings/updateSignature
 * Body: { signature }
 * 
 * Authentication: Required
 * Authorization: Updates only user's own client
 */
router.post('/updateSignature',
  authenticate,
  sanitizeText('signature', { required: true, maxLength: 10000 }),
  async (req, res) => {
    try {
      const signature = req.sanitized.signature;
      const client_id = req.user.client_id;

      console.log('[SETTINGS] Updating signature for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .update({ email_signature: signature })
        .eq('id', client_id)
        .select()
        .single();

      if (error) {
        console.error('[SETTINGS] Update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Signature updated successfully');
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
    }
  }
);

//uptaing the confimation mail send when a customer sends a mail to the client
router.post('/updateConfirmMail', 
  authenticate, 
  async (req, res) => {
    try {
      const subject = req.body.subject;
      const body = req.body.body;
      const client_id = req.user.client_id;
      console.log(subject, body, client_id);

      console.log('[SETTINGS] Updating confirmation mail for client:', client_id);

      const { data, error} = await supabase
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
      res.json({ success: true, data })
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
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
        return res.status(500).json({ error: 'Datenbankfehler' });
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
      res.json(safeData);
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
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
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[SETTINGS] Shopify status fetched');
      res.json({
        connected: data.shopify_connected || false,
        store_url: data.shopify_store_url || null,
        scope: data.shopify_scope || null
      });
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

//updating the setting show_assigned_mails_in_all_mails
router.post('/updateShowAssignedMails',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const value = req.body.value;

      console.log('[SETTINGS] Updating show assigned mails setting for client:', client_id);

      const { data, error } = await supabase
        .from('clients')
        .update({show_assigned_mails_in_all_mails: value})
        .eq('id', client_id)
      
      if (error) {
        console.error('[SETTINGS] Show assigned mails update failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[SETTINGS] Show assigned mails updated successfully');
      res.json({ success: true, data })
    } catch (err) {
      console.error('[SETTINGS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
    }
  }
);

module.exports = router;