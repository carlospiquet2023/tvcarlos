FROM alpine:3.22
RUN apk add --no-cache nginx nginx-mod-rtmp \
    && mkdir -p /var/cache/nginx/hls /var/lib/nginx/tmp /run/nginx \
    && chown -R nginx:nginx /var/cache/nginx /var/lib/nginx /run/nginx
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 1935 8080
STOPSIGNAL SIGQUIT
CMD ["nginx", "-e", "stderr", "-g", "daemon off;"]
