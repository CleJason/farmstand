#!/bin/sh
set -e

# Started as root: make the writable dirs (uploads volume, Next cache) belong to
# PUID:PGID, then run everything else as that user.
if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-99}"
  PGID="${PGID:-100}"
  echo "👤 Running as ${PUID}:${PGID}"
  mkdir -p /app/public/uploads /app/.next/cache
  chown -R "${PUID}:${PGID}" /app/public/uploads /app/.next/cache
  exec su-exec "${PUID}:${PGID}" "$0" "$@"
fi

echo "⚙️  Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "🚀 Starting server..."
exec node server.js
