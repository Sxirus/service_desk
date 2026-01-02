-- ============================================================================
-- Add created_at column to clients table
-- Migration: 004_add_created_at_to_clients
-- Description: Adds timestamp tracking for when clients were created
-- ============================================================================

-- Add created_at column with default value of now()
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- For existing rows, set created_at to now() if null
UPDATE clients 
SET created_at = now() 
WHERE created_at IS NULL;

-- Create index for efficient sorting/filtering by creation date
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);

-- ============================================================================
-- Verification query (optional - run to confirm)
-- ============================================================================
-- SELECT id, name, created_at FROM clients ORDER BY created_at DESC LIMIT 5;
