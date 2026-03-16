FROM node:20-bookworm

WORKDIR /app

# Install backend dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Install UI dependencies
COPY ui/package.json ui/package-lock.json* ./ui/
RUN cd ui && npm ci

# Copy application source
COPY scripts ./scripts
COPY ui ./ui
COPY src ./src

# Build UI into /dist using existing script
RUN npm run build

# Install Playwright Chromium for scraping pipeline
RUN npx playwright install chromium
RUN npx playwright install-deps chromium || true

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "src/server.js"]
