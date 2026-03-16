FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies separately to leverage Docker layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Install UI dependencies and build UI
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install --omit=dev

WORKDIR /app
COPY . .

# Build the UI into /dist using existing script
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy only what we need for runtime
COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/src ./src

# Expose the HTTP port used by src/server.js (see config.PORT with default 3001)
EXPOSE 3001

# Railway injects PORT; fall back to 3001 locally
ENV PORT=3001

CMD ["node", "src/server.js"]

# Production image for CHScanner. Node 20, UI built and served from backend, Playwright Chromium.
FROM node:20-bookworm

WORKDIR /app

# Backend dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# UI dependencies and build
COPY ui/package.json ui/package-lock.json* ui/
RUN cd ui && npm ci

# Application source
COPY scripts scripts/
COPY ui ui/
COPY src src/

# Build UI and copy into backend dist (required for npm run build)
RUN npm run build

# Playwright Chromium for pipeline/export (run after build so dist exists)
RUN npx playwright install chromium
RUN npx playwright install-deps chromium || true

EXPOSE 3001

# Persistent data must be mounted at /data (DB_PATH default in production)
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
