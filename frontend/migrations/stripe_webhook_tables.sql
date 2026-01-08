-- Migration: Stripe Webhook Tables for License Management
-- Run this in your Supabase SQL editor

-- 1. Create processed_webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  payload jsonb,
  CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (id)
);

-- Index for fast lookups by event_id
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_event_id 
  ON public.processed_webhook_events(event_id);

-- Index for cleanup of old events
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at 
  ON public.processed_webhook_events(processed_at);

-- 2. Create platform_notifications table for cancellation alerts
CREATE TABLE IF NOT EXISTS public.platform_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  client_id bigint,
  title text NOT NULL,
  message text,
  metadata jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT platform_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT platform_notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE
);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_platform_notifications_unread 
  ON public.platform_notifications(read, created_at DESC) WHERE read = false;

-- Index for client-specific notifications
CREATE INDEX IF NOT EXISTS idx_platform_notifications_client 
  ON public.platform_notifications(client_id);

-- 3. Add scheduled_disable_at column to employees table for grace period
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS scheduled_disable_at timestamp with time zone;

-- Index for scheduled disables
CREATE INDEX IF NOT EXISTS idx_employees_scheduled_disable 
  ON public.employees(scheduled_disable_at) WHERE scheduled_disable_at IS NOT NULL;

-- 4. Make admin_id nullable in platform_audit_log for automated webhook events
ALTER TABLE public.platform_audit_log 
  ALTER COLUMN admin_id DROP NOT NULL;

-- 5. Add cancellation tracking columns to clients table
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamp with time zone;

-- Comment for documentation
COMMENT ON TABLE public.processed_webhook_events IS 'Tracks processed Stripe webhook events to ensure idempotency';
COMMENT ON TABLE public.platform_notifications IS 'Platform-wide notifications for admins (cancellations, payment failures, etc.)';
COMMENT ON COLUMN public.employees.scheduled_disable_at IS 'When the employee should be auto-disabled (e.g., after subscription cancellation grace period)';
COMMENT ON COLUMN public.clients.subscription_cancelled_at IS 'When the subscription was cancelled';
COMMENT ON COLUMN public.clients.subscription_ends_at IS 'When the subscription access ends (current_period_end from Stripe)';
