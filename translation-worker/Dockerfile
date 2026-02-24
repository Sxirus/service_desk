FROM node:20-alpine

RUN addgroup -S worker && adduser -S worker -G worker

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN rm -f .env .env.*

USER worker

EXPOSE 3002

CMD ["node", "index.js"]
