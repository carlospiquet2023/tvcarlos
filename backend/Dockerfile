# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app

ENV HOME=/tmp \
    NPM_CONFIG_CACHE=/tmp/.npm

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node prisma ./prisma
RUN npx prisma generate

COPY --from=builder --chown=node:node /app/dist ./dist

COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0555 ./docker-entrypoint.sh \
    && mkdir -p \
      /app/uploads/videos \
      /app/uploads/hls \
      /app/uploads/images \
      /app/uploads/pdfs \
    && chown -R node:node /app/uploads \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
