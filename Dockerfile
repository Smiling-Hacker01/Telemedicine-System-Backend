# Multi-stage production Dockerfile for Amrutam Telemedicine Backend
# Stage 1: Build & Prune
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

RUN npm ci

COPY src ./src/
RUN npx prisma generate
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 amrutam -G nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Generate client in runner
RUN npx prisma generate

USER amrutam

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "dist/server.js"]
