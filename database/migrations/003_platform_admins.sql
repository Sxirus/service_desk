-- ============================================================================
-- Platform Administration Tables
-- Migration: 003_platform_admins
-- Description: Creates tables for platform-level administration
-- ============================================================================

-- Platform Admins Table
-- Stores users who have platform-level administrative access across all clients
CREATE TABLE IF NOT EXISTS platform_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    created_by uuid REFERENCES platform_admins(id),
    CONSTRAINT platform_admins_email_unique UNIQUE (email)
);

-- Platform Audit Log Table
-- Tracks all actions taken by platform admins for compliance and debugging
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES platform_admins(id) ON DELETE SET NULL,
    action text NOT NULL,
    target_type text NOT NULL, -- 'client', 'platform_admin', 'subscription', etc.
    target_id text, -- ID of the affected resource
    details jsonb, -- Additional context about the action
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(email);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_admin_id ON platform_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created_at ON platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_target ON platform_audit_log(target_type, target_id);

-- Row Level Security Policies
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

-- Platform admins: service role has full access
CREATE POLICY "Platform admins service role full access" ON platform_admins
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Platform admins: authenticated users can read their own record
CREATE POLICY "Platform admins read own record" ON platform_admins
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Audit log: service role only
CREATE POLICY "Platform audit log service role only" ON platform_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON platform_admins TO authenticated;
GRANT ALL ON platform_admins TO service_role;
GRANT ALL ON platform_audit_log TO service_role;

-- ============================================================================
-- Example: Insert first platform admin (run manually after migration)
-- Replace 'your-user-uuid' and 'your-email@example.com' with actual values
-- ============================================================================
-- INSERT INTO platform_admins (user_id, email)
-- VALUES ('your-user-uuid-here', 'your-email@example.com');
