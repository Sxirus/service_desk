/**
 * Email Accounts Management Routes
 * Handles CRUD operations for IMAP/SMTP configurations
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const encryption = require('../utils/encryption');
const { authenticate } = require('../middleware/auth');
const { authorizeAdmin } = require('../middleware/authorization');
const { validateId } = require('../middleware/validation');
const { stopWorkerById } = require('../services/workerManager');
const { logFromReq, ACTIONS } = require('../services/activityLogger');
const logger = require('../utils/logger');

/**
 * GET /api/email-accounts/providers
 * Fetch available email providers
 */
router.get('/providers', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('email-provider')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        logger.error('[EMAIL_ACCOUNTS] Providers error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch providers' });
    }
});

/**
 * GET /api/email-accounts
 * List all email accounts for the client
 */
router.get('/', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const client_id = req.user.client_id;

        const { data, error } = await supabase
            .from('client-emails')
            .select(`
                id,
                email_address,
                active,
                imap,
                imap_port,
                smtp,
                smtp_port,
                last_sync_at,
                last_error,
                provider_id,
                "email-provider" (name, logo_url, imap, imap_port, smtp, smtp_port)
            `)
            .eq('client_id', client_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data });
    } catch (err) {
        logger.error('[EMAIL_ACCOUNTS] Fetch error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch email accounts' });
    }
});

/**
 * POST /api/email-accounts
 * Add a new email account
 */
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const client_id = req.user.client_id;
        const { 
            email_address, 
            password, 
            provider_id, 
            imap, 
            imap_port, 
            smtp, 
            smtp_port 
        } = req.body;

        // Encrypt password before storage
        const encryptedPassword = encryption.encrypt(password);

        const { data, error } = await supabase
            .from('client-emails')
            .insert({
                client_id,
                email_address,
                password: encryptedPassword,
                provider_id,
                imap,
                imap_port,
                smtp,
                smtp_port,
                active: true,
                created_by: req.user.id
            })
            .select()
            .single();

        if (error) throw error;

        // Note: New workers are usually picked up on server restart or 
        // we could trigger a specific manager reload here.
        
        logFromReq(req, { ...ACTIONS.EMAIL_ACCOUNT_ADDED, targetType: 'email_account', targetId: data.id, details: { emailAddress: email_address } });
        res.json({ success: true, data });
    } catch (err) {
        logger.error('[EMAIL_ACCOUNTS] Create error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/email-accounts/:id
 * Update an existing account
 */
router.patch('/:id', authenticate, authorizeAdmin, validateId('id'), async (req, res) => {
    try {
        const { id } = req.params;
        const client_id = req.user.client_id;
        const updates = { ...req.body };

        // Verify ownership
        const { data: existing } = await supabase
            .from('client-emails')
            .select('client_id')
            .eq('id', id)
            .single();

        if (!existing || existing.client_id !== client_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // If password is being updated, encrypt it
        if (updates.password) {
            updates.password = encryption.encrypt(updates.password);
        }

        const { data, error } = await supabase
            .from('client-emails')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // If deactivated, stop the worker
        if (updates.active === false) {
            stopWorkerById(id);
        }

        logFromReq(req, { ...ACTIONS.EMAIL_ACCOUNT_UPDATED, targetType: 'email_account', targetId: id, details: { changedFields: Object.keys(updates).filter(k => k !== 'password') } });
        res.json({ success: true, data });
    } catch (err) {
        logger.error('[EMAIL_ACCOUNTS] Update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/email-accounts/:id
 * Remove an account
 */
router.delete('/:id', authenticate, authorizeAdmin, validateId('id'), async (req, res) => {
    try {
        const { id } = req.params;
        const client_id = req.user.client_id;

        // Check if this is the primary email
        const { data: client } = await supabase
            .from('clients')
            .select('primary_email_id')
            .eq('id', client_id)
            .single();

        if (client.primary_email_id == id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete the primary email account. Set another account as primary first.' 
            });
        }

        const { error } = await supabase
            .from('client-emails')
            .delete()
            .eq('id', id)
            .eq('client_id', client_id);

        if (error) throw error;

        // Stop the worker immediately
        stopWorkerById(id);

        logFromReq(req, { ...ACTIONS.EMAIL_ACCOUNT_DELETED, targetType: 'email_account', targetId: id });
        res.json({ success: true });
    } catch (err) {
        logger.error('[EMAIL_ACCOUNTS] Delete error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
