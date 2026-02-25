FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN rm -f .env .env.*

# Create attachments directory and give ownership to app user
RUN mkdir -p /app/attachments && chown -R app:app /app/attachments

USER app

EXPOSE 3000

CMD ["node", "index.js"]
