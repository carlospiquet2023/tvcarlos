FROM node:22.18.0-alpine3.22 AS api-dependencies
WORKDIR /build/api
COPY api/package.json api/package-lock.json ./
RUN npm ci

FROM api-dependencies AS api-build
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.18.0-alpine3.22 AS runtime
ENV NODE_ENV=production \
    API_PORT=3000 \
    IMAGE_STORAGE_DIR=/data/images \
    VIDEO_STORAGE_DIR=/data/videos \
    VIDEO_DIRECTORY=/data/videos \
    PLAYLIST_FILE=/app/playlists/programacao.txt \
    RTMP_HOST=127.0.0.1 \
    RTMP_PORT=1935 \
    RTMP_APPLICATION=live \
    LOOP_STREAM_NAME=loop

WORKDIR /app

RUN apk add --no-cache \
      ffmpeg \
      gettext-envsubst \
      nginx \
      nginx-mod-rtmp \
      supervisor \
      tini \
    && addgroup -S tvapp \
    && adduser -S -G tvapp -h /app tvapp \
    && mkdir -p \
      /app/api \
      /app/playlists \
      /app/scripts \
      /app/seed-videos \
      /app/site \
      /data/images \
      /data/videos \
      /run/nginx \
      /var/cache/nginx/hls \
      /var/lib/nginx/tmp/body \
      /var/lib/nginx/tmp/proxy \
    && chown -R tvapp:tvapp /app /data \
    && chown -R nginx:nginx /run/nginx /var/cache/nginx /var/lib/nginx

COPY --from=api-build --chown=tvapp:tvapp /build/api/node_modules /app/api/node_modules
COPY --from=api-build --chown=tvapp:tvapp /build/api/dist /app/api/dist
COPY --from=api-build --chown=tvapp:tvapp /build/api/package.json /app/api/package.json
COPY --chown=tvapp:tvapp site /app/site
COPY --chown=tvapp:tvapp playlists /app/playlists
COPY --chown=tvapp:tvapp scripts/gerar-tv.sh /app/scripts/gerar-tv.sh
COPY --chown=tvapp:tvapp videos /app/seed-videos
COPY deploy/railway/nginx.conf.template /app/deploy/nginx.conf.template
COPY deploy/railway/supervisord.conf /etc/supervisord.conf
COPY deploy/railway/entrypoint.sh /app/deploy/entrypoint.sh

RUN chmod 0555 /app/deploy/entrypoint.sh /app/scripts/gerar-tv.sh \
    && find /app/site -type d -exec chmod 0555 {} \; \
    && find /app/site -type f -exec chmod 0444 {} \;

EXPOSE 1935
STOPSIGNAL SIGTERM
ENTRYPOINT ["/sbin/tini", "--", "/app/deploy/entrypoint.sh"]
