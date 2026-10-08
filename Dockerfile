# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
# Prisma engines need OpenSSL at build time and at runtime
RUN apk add --no-cache libc6-compat openssl

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy prisma for migrations at startup
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Prisma CLI (not traced into standalone) so the entrypoint can run migrate deploy
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Uploads directory
RUN mkdir -p /app/public/uploads /app/.next/cache

# su-exec lets the entrypoint fix volume ownership as root, then drop to PUID/PGID
RUN apk add --no-cache su-exec

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Git commit this image was built from (shown in admin and /api/health)
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
# Unraid convention: nobody:users. Override to match your host.
ENV PUID=99
ENV PGID=100

ENTRYPOINT ["./docker-entrypoint.sh"]
