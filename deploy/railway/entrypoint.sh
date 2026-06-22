#!/bin/sh
set -eu

: "${PORT:=8080}"
: "${API_PORT:=3000}"
: "${DATABASE_URL:?DATABASE_URL não configurada}"
: "${RTMP_STREAM_KEY:?RTMP_STREAM_KEY não configurada}"
: "${LOOP_STREAM_KEY:?LOOP_STREAM_KEY não configurada}"

case "$PORT" in
  ''|*[!0-9]*)
    echo "PORT deve ser uma porta numérica válida." >&2
    exit 1
    ;;
esac

if [ -z "${APP_ORIGIN:-}" ]; then
  if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
    APP_ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
    export APP_ORIGIN
  else
    echo "APP_ORIGIN ou RAILWAY_PUBLIC_DOMAIN deve estar configurado." >&2
    exit 1
  fi
fi

mkdir -p \
  /data/images \
  /data/videos \
  /run/nginx \
  /var/cache/nginx/hls \
  /var/lib/nginx/tmp/body \
  /var/lib/nginx/tmp/proxy

migration_state_directory=/data/.deploy-migrations
mkdir -p "$migration_state_directory"
for migration in /app/deploy/migrations/*.sh; do
  [ -f "$migration" ] || continue
  migration_name=$(basename "$migration")
  migration_marker="$migration_state_directory/$migration_name"
  if [ ! -f "$migration_marker" ]; then
    echo "Executando migração de volume: $migration_name"
    /bin/sh "$migration"
    touch "$migration_marker"
  fi
done

if [ ! -f /data/.tvcarlos-initialized ]; then
  cp -p /app/seed-videos/* /data/videos/ 2>/dev/null || true
  chown -R tvapp:tvapp /data
  touch /data/.tvcarlos-initialized
  chown tvapp:tvapp /data/.tvcarlos-initialized
else
  chown tvapp:tvapp /data /data/images /data/videos "$migration_state_directory"
fi

chown -R nginx:nginx /run/nginx /var/cache/nginx /var/lib/nginx

envsubst '$PORT' \
  < /app/deploy/nginx.conf.template \
  > /etc/nginx/nginx.conf

nginx -t

exec /usr/bin/supervisord -c /etc/supervisord.conf
