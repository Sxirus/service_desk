/**
 * Authentication Middleware
 * Verifies that requests include valid authentication and extracts user info
 * 
 * This middleware should be applied to all protected routes.
 * It verifies the JWT token from Supabase and attaches user info to req.user
 */

const supabase = require('../config/supabase');

/**
 * Middleware to authenticate requests using Supabase JWT
 * Expects Authorization header with format: "Bearer <token>"
 */
async function authenticate(req, res, next) {
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
      console.error('[AUTH] Token verification failed:', error?.message);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token' 
      });
    }

    // Fetch employee record to get client_id and additional info
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, name, client_id')
      .eq('user_id', user.id)
      .single();

    if (employeeError || !employee) {
      console.error('[AUTH] Employee not found for user:', user.id);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'User is not associated with any client' 
      });
    }

    // Attach user info to request object for use in route handlers
    req.user = {
      id: user.id,
      email: user.email,
      employee_id: employee.id,
      employee_name: employee.name,
      client_id: employee.client_id
    };

    console.log('[AUTH] User authenticated:', {
      employee_id: employee.id,
      client_id: employee.client_id,
      email: user.email
    });

    next();
  } catch (error) {
    console.error('[AUTH] Authentication error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication failed' 
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that work differently for authenticated vs anonymous users
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next();
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('id, name, client_id')
      .eq('user_id', user.id)
      .single();

    if (employee) {
      req.user = {
        id: user.id,
        email: user.email,
        employee_id: employee.id,
        employee_name: employee.name,
        client_id: employee.client_id
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('[AUTH] Optional authentication error:', error);
    req.user = null;
    next();
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate
};