# Verwende Node.js Basis-Image
FROM node:20-alpine

# Arbeitsverzeichnis im Container
WORKDIR /app

# Installiere dev-Tools (z. B. nodemon) über package.json
COPY package*.json ./

# Installiere alle Abhängigkeiten
RUN npm install

# Kopiere den Rest der Anwendung
COPY . .

# Port für Express (Standard: 3000)
EXPOSE 3000

# Starte den Entwicklungsserver (z. B. mit nodemon)
CMD ["npm", "run", "dev"]
