# Kundaro

Kundaro is a multi-service customer-support platform with:

- **Frontend**: Astro SSR + React UI (`frontend`, port `4321`)
- **Backend API**: Express + Supabase integration (`backend`, port `3000`)
- **IMAP Worker**: background inbox sync service (`imap-worker`)

The repository is organized as a monorepo with separate Node.js projects per service.

## Repository Structure

```text
service_desk/
├── backend/                 # Express API server
├── frontend/                # Astro + React web app
├── imap-worker/             # Background IMAP polling workers
├── docker-compose.yml       # Multi-service local orchestration
├── STRIPE_WEBHOOKS_SETUP.md # Stripe webhook setup details
└── STYLE_GUIDE.md           # Frontend design/style conventions
```

## Tech Stack

- **Frontend**: Astro (SSR), React, TypeScript, Tailwind, shadcn/ui
- **Backend**: Node.js, Express, Supabase, Stripe, Shopify integration
- **Worker**: Node.js IMAP polling + email processing
- **Infrastructure**: Docker Compose (optional local orchestration)

## Prerequisites

- Node.js + npm
- Supabase project (URL + keys)
- Stripe account (for subscriptions/webhooks)
- Optional: Shopify app credentials (if using Shopify routes)
- Optional: Docker + Docker Compose

## Environment Variables

You need separate `.env` files per service.

### 1) Frontend (`frontend/.env`)

Start from `frontend/.env.example`.

```env
DEBUG=true
ENABLE_PERFORMANCE_TRACKING=true
API_URL=http://localhost:3000
ASTRO_URL=http://localhost:4321

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key

PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_public_anon_key
PUBLIC_API_URL=http://localhost:3000/api

TURNSTILE_SITE_KEY=your_turnstile_site_key

SHOPIFY_CLIENT_ID=your_shopify_client_id
SHOPIFY_SECRET=your_shopify_secret
SHOPIFY_REDIRECT_URI=http://localhost:4321/api/shopify/callback

PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 2) Backend (`backend/.env`)

Create this file manually (no committed backend example file exists yet):

```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4321

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key

ENCRYPTION_SECRET=your_shared_encryption_secret
LOG_LEVEL=info

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

SHOPIFY_CLIENT_ID=your_shopify_client_id
SHOPIFY_SECRET=your_shopify_secret
SHOPIFY_REDIRECT_URI=http://localhost:3000/api/shopify/callback
```

### 3) IMAP Worker (`imap-worker/.env`)

Start from `imap-worker/.env.example`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key
ENCRYPTION_SECRET=your_shared_encryption_secret

NODE_ENV=development
LOG_LEVEL=info
SYNC_INTERVAL_MS=60000
```

> `ENCRYPTION_SECRET` must be identical in `backend` and `imap-worker`.

## Local Development (without Docker)

Open three terminals:

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### IMAP Worker

```bash
cd imap-worker
npm install
npm run dev
```

Expected URLs:

- Frontend: `http://localhost:4321`
- Backend API: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

## Docker Development

From repository root:

```bash
docker compose up --build
```

This starts:

- `kundaro_frontend`
- `kundaro_backend`
- `kundaro_imap_worker`

The compose file reads backend/worker secrets from environment variables available to Docker (for example via a root `.env` file or shell environment).

## Database & Migrations

- SQL migration files are in `frontend/migrations/`.
- A base SQL structure file exists at `frontend/database_structure.sql`.
- Apply migrations through your Supabase SQL workflow.

## Key API Route Groups

The backend mounts route groups under `/api`, including:

- `/api/health`
- `/api/emails`
- `/api/customers`
- `/api/macros`
- `/api/settings`
- `/api/client`
- `/api/shopify`
- `/api/analytics`
- `/api/groups`
- `/api/inboxes`
- `/api/email-accounts`
- `/api/avatars`
- `/api/activity-log`
- `/api/platform`
- `/api/webhooks/stripe` (raw-body webhook endpoint)

## Stripe Webhooks

Webhook integration is implemented in the backend and should point to:

- `https://your-domain.com/api/webhooks/stripe` (production)
- or your local tunneled backend URL in development.

Detailed setup and event coverage: see `STRIPE_WEBHOOKS_SETUP.md`.

## Operational Notes

- CSRF protection for state-changing API requests requires header:
	`X-Requested-With: XMLHttpRequest`.
- Backend CORS origin is controlled by `FRONTEND_URL`.
- `NODE_ENV=production` enables stricter TLS behavior in email/IMAP flows.
- IMAP workers re-sync active accounts at interval `SYNC_INTERVAL_MS`.

## Scripts

### Backend (`backend/package.json`)

- `npm run dev` — start with nodemon
- `npm start` — start with node

### Frontend (`frontend/package.json`)

- `npm run dev` — Astro dev server
- `npm run build` — production build
- `npm run preview` — preview production build

### IMAP Worker (`imap-worker/package.json`)

- `npm run dev` — worker with nodemon
- `npm start` — worker with node

## Additional Documentation

- Frontend details: `frontend/README.md`
- Frontend design system: `STYLE_GUIDE.md`
- Stripe webhooks and scheduled job: `STRIPE_WEBHOOKS_SETUP.md`
