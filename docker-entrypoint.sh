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
# The database may still be starting (e.g. everything restarted together after
# a backup): keep trying for about 3 minutes instead of exiting on the first try.
tries=0
until node node_modules/prisma/build/index.js migrate deploy; do
  tries=$((tries + 1))
  if [ "$tries" -ge 36 ]; then
    echo "❌ Database still not reachable, giving up"
    exit 1
  fi
  echo "⏳ Database not ready, retrying in 5s ($tries/36)..."
  sleep 5
done

echo "🚀 Starting server..."
exec node server.js
