-- Migration: Add html_content column to sent-mail table
-- This supports rich-text (HTML) email composition from the reply area.
-- Run this migration in your Supabase SQL editor.

ALTER TABLE public."sent-mail"
ADD COLUMN IF NOT EXISTS html_content text;

COMMENT ON COLUMN public."sent-mail".html_content IS 'HTML version of the sent email content (rich text formatting)';
