FROM alpine:3.22

RUN apk add --no-cache nginx nginx-mod-rtmp \
    && mkdir -p /var/cache/nginx/hls \
    && chown -R nginx:nginx /var/cache/nginx

COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf

USER nginx

EXPOSE 1935 8080

STOPSIGNAL SIGQUIT

ENTRYPOINT ["nginx", "-e", "stderr", "-g", "daemon off;"]
