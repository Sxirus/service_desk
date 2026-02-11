-- Add is_internal_note column to sent-mail table
-- Internal notes are visible in the email thread for agents only, never sent to the customer
ALTER TABLE public."sent-mail"
  ADD COLUMN is_internal_note boolean NOT NULL DEFAULT false;

-- Index for quick filtering of internal notes per customer
CREATE INDEX idx_sent_mail_internal_note ON public."sent-mail" (customer_id, is_internal_note);
