-- Add confirmation_mail_mode column to clients table
-- Controls when confirmation emails are sent:
--   'all'      = send on every incoming email (default, preserves existing behavior)
--   'new_only' = send only when the customer has no open/waiting/new tickets
--   'disabled' = never send confirmation emails
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS confirmation_mail_mode text NOT NULL DEFAULT 'all'
  CHECK (confirmation_mail_mode IN ('all', 'new_only', 'disabled'));
