# WATERMARK_AUTHOR: Hecho por Gerardo Esparza
FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3001

# Run DB migrations on startup, then start API.
CMD ["sh", "-c", "node scripts/run-migrations.js && node src/server.js"]
