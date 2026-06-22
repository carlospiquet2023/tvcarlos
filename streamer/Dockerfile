FROM alpine:3.22
RUN apk add --no-cache ffmpeg tini \
    && addgroup -S streamer \
    && adduser -S -G streamer streamer
USER streamer
ENTRYPOINT ["/sbin/tini", "--", "sh", "/scripts/gerar-tv.sh"]
