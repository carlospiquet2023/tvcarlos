#!/bin/sh
set -eu

: "${LOOP_STREAM_KEY:?LOOP_STREAM_KEY não configurada}"

VIDEO_DIRECTORY="${VIDEO_DIRECTORY:-/media/videos}"
PLAYLIST_FILE="${PLAYLIST_FILE:-/playlists/playlist.txt}"
RTMP_HOST="${RTMP_HOST:-broadcast}"
RTMP_PORT="${RTMP_PORT:-1935}"
RTMP_APPLICATION="${RTMP_APPLICATION:-live}"
LOOP_STREAM_NAME="${LOOP_STREAM_NAME:-loop}"
BROADCAST_HEALTH_URL="${BROADCAST_HEALTH_URL:-http://broadcast:8080/health/live}"

if [ ! -r "$PLAYLIST_FILE" ]; then
    echo "Playlist não encontrada ou sem leitura: $PLAYLIST_FILE" >&2
    exit 1
fi

echo "Aguardando o serviço de broadcast..."
attempt=0
until wget -q -O /dev/null "$BROADCAST_HEALTH_URL"; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "Broadcast indisponível após 30 tentativas." >&2
        exit 1
    fi
    sleep 2
done

while true; do
    playable=0

    while IFS= read -r raw_file || [ -n "$raw_file" ]; do
        file=$(printf '%s' "$raw_file" | tr -d '\r')

        case "$file" in
            ''|'#'*) continue ;;
            /*|*'..'*)
                echo "Entrada insegura ignorada na playlist: $file" >&2
                continue
                ;;
        esac

        filepath="$VIDEO_DIRECTORY/$file"
        if [ ! -f "$filepath" ]; then
            echo "Vídeo ausente, ignorando: $filepath" >&2
            continue
        fi

        playable=$((playable + 1))
        echo "Transmitindo no canal loop: $file"

        if ffmpeg -hide_banner -nostdin -loglevel warning -re -i "$filepath" \
            -map 0:v:0 -map "0:a:0?" \
            -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
            -r 30 -c:v libx264 -preset veryfast -b:v 2000k -maxrate 2000k -bufsize 4000k \
            -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 \
            -c:a aac -b:a 128k -ar 48000 \
            -f flv "rtmp://${RTMP_HOST}:${RTMP_PORT}/${RTMP_APPLICATION}/${LOOP_STREAM_NAME}?token=${LOOP_STREAM_KEY}" \
            >/dev/null 2>&1; then
            echo "Programa concluído: $file"
        else
            echo "Transmissão interrompida: $file; o loop continuará." >&2
        fi

        sleep 2
    done < "$PLAYLIST_FILE"

    if [ "$playable" -eq 0 ]; then
        echo "Playlist sem vídeos válidos; nova leitura em 15 segundos." >&2
        sleep 15
    else
        echo "Fim da playlist; reiniciando em 3 segundos."
        sleep 3
    fi
done
