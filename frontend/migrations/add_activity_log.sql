-- Migration: Activity Log for per-tenant audit trail
-- Run this in your Supabase SQL editor

-- 1. Create the activity_log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  employee_id bigint,
  action text NOT NULL,
  category text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address inet,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT activity_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL
);

-- 2. Indexes for efficient querying
-- Primary feed: all activity for a client, newest first
CREATE INDEX IF NOT EXISTS idx_activity_log_client_created
  ON public.activity_log (client_id, created_at DESC);

-- Filtered by category
CREATE INDEX IF NOT EXISTS idx_activity_log_client_category
  ON public.activity_log (client_id, category, created_at DESC);

-- Per-agent filter
CREATE INDEX IF NOT EXISTS idx_activity_log_client_employee
  ON public.activity_log (client_id, employee_id, created_at DESC);

-- Entity-specific history
CREATE INDEX IF NOT EXISTS idx_activity_log_client_target
  ON public.activity_log (client_id, target_type, target_id, created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- 4. SELECT policy: only admins (role_id = 1) can read activity logs for their own client
CREATE POLICY activity_log_admin_read ON public.activity_log
  FOR SELECT
  USING (
    client_id IN (
      SELECT e.client_id
      FROM public.employees e
      JOIN public."roles-employees" re ON re.employee_id = e.id
      WHERE e.user_id = auth.uid()
        AND re.role_id = 1
    )
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through backend service role (bypasses RLS)

-- 5. Comments for documentation
COMMENT ON TABLE public.activity_log IS 'Per-tenant audit trail of all agent and system actions. Immutable — no update or delete by users.';
COMMENT ON COLUMN public.activity_log.action IS 'Dotted action identifier, e.g. email.sent, customer.merged, shopify.refund_created';
COMMENT ON COLUMN public.activity_log.category IS 'Action category for filtering: email, ticket, customer, assignment, shopify, settings, employee_mgmt, macro, group, inbox, email_account, billing, auth';
COMMENT ON COLUMN public.activity_log.target_type IS 'Entity type affected: customer, employee, macro, inbox, group, order, etc.';
COMMENT ON COLUMN public.activity_log.target_id IS 'Polymorphic ID of the affected entity (stored as text)';
COMMENT ON COLUMN public.activity_log.details IS 'Action-specific payload (old/new values, names, amounts). Never contains passwords or tokens.';

-- 6. Optional: scheduled cleanup of old entries (requires pg_cron extension)
-- SELECT cron.schedule('activity-log-cleanup', '0 3 * * 0', $$DELETE FROM public.activity_log WHERE created_at < now() - interval '90 days'$$);
