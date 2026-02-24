-- Migration: Add sender_display_name to clients table
-- This allows each client to customize the "From" display name for outbound emails.
-- When NULL, the system falls back to clients.name.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS sender_display_name text DEFAULT NULL;

COMMENT ON COLUMN clients.sender_display_name IS 'Custom display name for outbound email "From" header. Falls back to clients.name when NULL.';
