# Base Image: Node.js mit Alpine für kleine Größe
FROM node:20-alpine

# Setze Arbeitsverzeichnis im Container
WORKDIR /app

# Installiere pnpm oder npm – falls du pnpm nutzt, ändere es entsprechend
# COPY nur package.json und package-lock.json zuerst (für Layer-Caching)
COPY package*.json ./

# Installiere Abhängigkeiten
RUN npm install

# Kopiere gesamten Code
COPY . .

# Exponiere den Port, auf dem Astro läuft (Standard: 4321)
EXPOSE 4321

# Standardbefehl: startet Dev-Server
CMD ["npm", "run", "dev"]
