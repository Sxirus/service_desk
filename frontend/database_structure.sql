-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public._health_check (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT _health_check_pkey PRIMARY KEY (id)
);
CREATE TABLE public.activity_log (
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
  CONSTRAINT activity_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT activity_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.ai_responses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  email_id bigint,
  client_id bigint,
  response_text text NOT NULL,
  category text,
  sentiment text CHECK (sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text])),
  confidence numeric CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  internal_notes text,
  status text DEFAULT 'pending_review'::text CHECK (status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'modified'::text, 'sent'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  modified_response text,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_responses_pkey PRIMARY KEY (id),
  CONSTRAINT ai_responses_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.incoming-mails(id),
  CONSTRAINT ai_responses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.client-emails (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  provider_id bigint NOT NULL,
  email_address text NOT NULL,
  password text NOT NULL,
  client_id bigint NOT NULL,
  active boolean,
  created_by uuid,
  imap text,
  imap_port integer,
  smtp text,
  smtp_port integer,
  last_sync_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client-emails_pkey PRIMARY KEY (id),
  CONSTRAINT Client-Email_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.email-provider(id),
  CONSTRAINT Client-Email_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT client-emails_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.client_policies (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  client_id bigint UNIQUE,
  return_policy text,
  shipping_policy text,
  terms_of_service text,
  faq text,
  support_email text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_policies_pkey PRIMARY KEY (id),
  CONSTRAINT client_policies_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.clients (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  name text NOT NULL,
  address_street text,
  address_city text,
  address_zip integer,
  address_country text,
  vat text,
  website text,
  isActive boolean NOT NULL DEFAULT true,
  shopify_store_url text,
  shopify_access_token text,
  shopify_connected boolean DEFAULT false,
  shopify_scope text,
  email_signature text,
  confirm_mail text,
  confirmation_mail_subject text,
  show_assigned_mails_in_all_mails boolean DEFAULT true,
  auto_assign_employee_on_send boolean NOT NULL DEFAULT false,
  email_sending_mode text NOT NULL DEFAULT 'primary'::text,
  primary_email_id integer,
  stripe_customer_id character varying,
  subscription_tier text DEFAULT 'free'::text,
  stripe_subscription_id text,
  created_at timestamp with time zone DEFAULT now(),
  subscription_cancelled_at timestamp with time zone,
  subscription_ends_at timestamp with time zone,
  tracking_settings jsonb DEFAULT '{"providers": [], "customProviders": []}'::jsonb,
  confirmation_mail_mode text NOT NULL DEFAULT 'all'::text CHECK (confirmation_mail_mode = ANY (ARRAY['all'::text, 'new_only'::text, 'disabled'::text])),
  sender_display_name text,
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_primary_email_id_fkey FOREIGN KEY (primary_email_id) REFERENCES public.client-emails(id)
);
CREATE TABLE public.customers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id bigint NOT NULL,
  employee_id bigint,
  assg.Role_id bigint,
  name text,
  group_id bigint,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT Customer_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT Customer_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT Customer_assg.Role_id_fkey FOREIGN KEY (assg.Role_id) REFERENCES public.roles(id),
  CONSTRAINT customers_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id)
);
CREATE TABLE public.email-addresses (
  customer_id bigint NOT NULL,
  email_address text NOT NULL UNIQUE,
  CONSTRAINT email-addresses_pkey PRIMARY KEY (email_address),
  CONSTRAINT email-adress_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.email-provider (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  smtp text NOT NULL,
  smtp_port bigint NOT NULL,
  imap text NOT NULL,
  imap_port bigint NOT NULL,
  logo_url text,
  CONSTRAINT email-provider_pkey PRIMARY KEY (id)
);
CREATE TABLE public.employee_group_members (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  group_id bigint NOT NULL,
  employee_id bigint NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employee_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT employee_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id),
  CONSTRAINT employee_group_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.employee_groups (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employee_groups_pkey PRIMARY KEY (id),
  CONSTRAINT employee_groups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.employees (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id bigint NOT NULL,
  name text NOT NULL,
  user_id uuid UNIQUE,
  disabled boolean DEFAULT false,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  scheduled_disable_at timestamp with time zone,
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT Employee_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.inbox_filters (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  inbox_id bigint NOT NULL,
  filter_type text NOT NULL,
  filter_config jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inbox_filters_pkey PRIMARY KEY (id),
  CONSTRAINT inbox_filters_inbox_id_fkey FOREIGN KEY (inbox_id) REFERENCES public.inboxes(id)
);
CREATE TABLE public.inbox_groups (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  inbox_id bigint NOT NULL,
  group_id bigint NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inbox_groups_pkey PRIMARY KEY (id),
  CONSTRAINT inbox_groups_inbox_id_fkey FOREIGN KEY (inbox_id) REFERENCES public.inboxes(id),
  CONSTRAINT inbox_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id)
);
CREATE TABLE public.inboxes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inboxes_pkey PRIMARY KEY (id),
  CONSTRAINT inboxes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT inboxes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.incoming-mails (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  send_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_id bigint NOT NULL,
  subject text,
  text_content text,
  email_address text NOT NULL,
  html_content text,
  client_id bigint NOT NULL,
  read boolean DEFAULT false,
  to_email_address text,
  received_by text,
  attachments jsonb,
  message_id text,
  status text DEFAULT 'new'::text CHECK (status = ANY (ARRAY['new'::text, 'open'::text, 'waiting'::text, 'resolved'::text])),
  CONSTRAINT incoming-mails_pkey PRIMARY KEY (id),
  CONSTRAINT Mail_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT incoming-mails_email_address_fkey FOREIGN KEY (email_address) REFERENCES public.email-addresses(email_address),
  CONSTRAINT incoming-mails_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.macro_groups (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id bigint NOT NULL,
  name text,
  group_id bigint,
  CONSTRAINT macro_groups_pkey PRIMARY KEY (id),
  CONSTRAINT macro_groups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT macro_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.macro_groups(id)
);
CREATE TABLE public.macros (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  client_id bigint NOT NULL,
  title text,
  text text,
  group_id bigint,
  attachments jsonb,
  CONSTRAINT macros_pkey PRIMARY KEY (id),
  CONSTRAINT macros_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT macros_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.macro_groups(id)
);
CREATE TABLE public.platform_admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  created_by uuid,
  CONSTRAINT platform_admins_pkey PRIMARY KEY (id),
  CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT platform_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_admins(id)
);
CREATE TABLE public.platform_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT platform_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.platform_admins(id)
);
CREATE TABLE public.platform_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  client_id bigint,
  title text NOT NULL,
  message text,
  metadata jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT platform_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT platform_notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.processed_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  payload jsonb,
  CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.registration_sessions (
  reg_nonce text NOT NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'in_progress'::text,
  partial_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_step integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT registration_sessions_pkey PRIMARY KEY (reg_nonce),
  CONSTRAINT registration_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.roles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.roles-employees (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  employee_id bigint NOT NULL,
  role_id bigint NOT NULL,
  CONSTRAINT roles-employees_pkey PRIMARY KEY (id),
  CONSTRAINT Role-Employee_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT Role-Employee_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id)
);
CREATE TABLE public.sent-mail (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  send_at timestamp with time zone NOT NULL DEFAULT now(),
  employee_id bigint NOT NULL,
  text_content text,
  customer_id bigint NOT NULL,
  provider_name text,
  sent_via text,
  attachments jsonb,
  html_content text,
  is_internal_note boolean NOT NULL DEFAULT false,
  CONSTRAINT sent-mail_pkey PRIMARY KEY (id),
  CONSTRAINT send-mail_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT send-mail_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);