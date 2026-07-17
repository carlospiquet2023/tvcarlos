FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:1.30.3-alpine3.23

ARG NGINX_CONF=nginx.docker.conf
ARG LISTEN_PORT=5173

COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

RUN apk upgrade --no-cache \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run \
    && sed -i '/user  nginx;/d' /etc/nginx/nginx.conf

USER nginx

EXPOSE ${LISTEN_PORT}

ENTRYPOINT ["nginx", "-e", "stderr", "-g", "daemon off;"]
