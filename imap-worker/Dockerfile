FROM node:20-alpine

# Install build dependencies needed by sharp and imap (node-gyp)
RUN apk add --no-cache python3 make g++ vips-dev

# Create a non-root user for security
RUN addgroup -S worker && adduser -S worker -G worker

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Remove any accidentally copied .env files
RUN rm -f .env .env.*

# Switch to non-root user
USER worker

CMD ["node", "index.js"]
