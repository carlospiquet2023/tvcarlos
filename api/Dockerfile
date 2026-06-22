FROM node:22.18.0-alpine3.22 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.18.0-alpine3.22 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache ffmpeg tini \
    && addgroup -S tvapp \
    && adduser -S -G tvapp -h /app tvapp \
    && mkdir -p /data/images /data/videos \
    && chown -R tvapp:tvapp /app /data
COPY --from=build --chown=tvapp:tvapp /app/node_modules ./node_modules
COPY --from=build --chown=tvapp:tvapp /app/dist ./dist
COPY --from=build --chown=tvapp:tvapp /app/package.json ./package.json
USER tvapp
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
