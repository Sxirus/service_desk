/**
 * Platform Admin Authentication Middleware
 * Verifies that the user is a platform administrator with cross-client access
 * 
 * This middleware should be applied to all /api/platform/* routes.
 * It verifies the JWT token and checks the platform_admins table.
 */

const supabase = require('../config/supabase');

/**
 * Middleware to authenticate platform admin requests
 * Expects Authorization header with format: "Bearer <token>"
 * 
 * Unlike regular auth, this:
 * 1. Does NOT require an employee record
 * 2. Checks the platform_admins table instead
 * 3. Provides cross-client access
 */
async function authenticatePlatformAdmin(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No valid authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[PLATFORM_AUTH] Token verification failed:', error?.message);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token' 
      });
    }

    // Check if user is a platform admin
    const { data: platformAdmin, error: platformError } = await supabase
      .from('platform_admins')
      .select('id, user_id, email')
      .eq('user_id', user.id)
      .single();

    if (platformError || !platformAdmin) {
      console.error('[PLATFORM_AUTH] User is not a platform admin:', user.id);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Platform admin access required' 
      });
    }

    // Update last_login timestamp
    await supabase
      .from('platform_admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', platformAdmin.id);

    // Attach platform admin info to request object
    req.platformAdmin = {
      id: platformAdmin.id,
      user_id: user.id,
      email: platformAdmin.email
    };

    // Also attach basic user info for convenience
    req.user = {
      id: user.id,
      email: user.email
    };

    console.log('[PLATFORM_AUTH] Platform admin authenticated:', {
      platform_admin_id: platformAdmin.id,
      email: platformAdmin.email
    });

    next();
  } catch (error) {
    console.error('[PLATFORM_AUTH] Authentication error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Platform authentication failed' 
    });
  }
}

/**
 * Middleware to require platform admin access
 * Use after regular authenticate() if the user might also be an employee
 */
async function requirePlatformAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required' 
      });
    }

    // Check if user is a platform admin
    const { data: platformAdmin, error: platformError } = await supabase
      .from('platform_admins')
      .select('id, user_id, email')
      .eq('user_id', req.user.id)
      .single();

    if (platformError || !platformAdmin) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Platform admin access required' 
      });
    }

    // Attach platform admin info
    req.platformAdmin = {
      id: platformAdmin.id,
      user_id: req.user.id,
      email: platformAdmin.email
    };

    next();
  } catch (error) {
    console.error('[PLATFORM_AUTH] requirePlatformAdmin error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Platform authorization failed' 
    });
  }
}

/**
 * Log a platform admin action to the audit log
 * @param {string} adminId - Platform admin ID
 * @param {string} action - Action performed (e.g., 'update_client', 'add_admin')
 * @param {string} targetType - Type of resource affected
 * @param {string} targetId - ID of affected resource
 * @param {object} details - Additional details
 * @param {object} req - Express request object for IP/user agent
 */
async function logPlatformAction(adminId, action, targetType, targetId, details, req) {
  try {
    await supabase
      .from('platform_audit_log')
      .insert({
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: req?.ip || req?.connection?.remoteAddress || null,
        user_agent: req?.headers?.['user-agent'] || null
      });
  } catch (error) {
    console.error('[PLATFORM_AUDIT] Failed to log action:', error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

module.exports = {
  authenticatePlatformAdmin,
  requirePlatformAdmin,
  logPlatformAction
};
