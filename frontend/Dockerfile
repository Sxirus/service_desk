# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN rm -f .env .env.*

# Astro needs PUBLIC_ env vars at build time for client-side code.
# Pass them as build args or use a .env file during CI; here we rely on
# Docker build-args forwarded to the environment.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_API_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG TURNSTILE_SITE_KEY

ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_STRIPE_PUBLISHABLE_KEY=$PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy built output and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER app

EXPOSE 4321

ENV HOST=0.0.0.0
ENV PORT=4321

CMD ["node", "./dist/server/entry.mjs"]
