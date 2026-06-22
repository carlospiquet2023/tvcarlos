#!/bin/sh
set -eu

: "${LOOP_STREAM_KEY:?LOOP_STREAM_KEY não configurada}"

VIDEO_DIRECTORY="${VIDEO_DIRECTORY:-/videos}"
PLAYLIST_FILE="${PLAYLIST_FILE:-/playlists/programacao.txt}"
RTMP_HOST="${RTMP_HOST:-nginx-rtmp}"
RTMP_PORT="${RTMP_PORT:-1935}"
RTMP_APPLICATION="${RTMP_APPLICATION:-live}"
LOOP_STREAM_NAME="${LOOP_STREAM_NAME:-loop}"

# Espera o servidor Nginx-RTMP estar pronto
echo "Aguardando o Nginx-RTMP iniciar..."
sleep 5

while true; do
  while read -r file || [ -n "$file" ]; do
    # Remove retorno de carro (\r) se o arquivo foi salvo no Windows
    file=$(echo "$file" | tr -d '\r')

    # Ignora linhas vazias
    if [ -z "$file" ]; then
      continue
    fi

    # Ignora comentários que começam com '#'
    first_char=$(echo "$file" | cut -c1)
    if [ "$first_char" = "#" ]; then
      continue
    fi

    filepath="$VIDEO_DIRECTORY/$file"
    if [ -f "$filepath" ]; then
      echo "----------------------------------------------"
      echo "Transmitindo programa: $file"
      echo "----------------------------------------------"

      # Transmite o vídeo em loop mantendo tempo real (-re) e convertendo para 720p estável
      if ffmpeg -hide_banner -nostdin -loglevel error -re -i "$filepath" \
          -c:v libx264 -preset veryfast -b:v 2000k -maxrate 2000k -bufsize 4000k \
          -pix_fmt yuv420p -g 60 -keyint_min 30 \
          -c:a aac -b:a 128k -ar 48000 \
          -f flv "rtmp://${RTMP_HOST}:${RTMP_PORT}/${RTMP_APPLICATION}/${LOOP_STREAM_NAME}?token=${LOOP_STREAM_KEY}" \
          >/dev/null 2>&1; then
        echo "Programa finalizado: $file"
      else
        echo "Transmissão interrompida: $file. Nova tentativa será realizada."
      fi

      echo "Aguardando 2 segundos..."
      sleep 2
    else
      echo "Arquivo de vídeo não encontrado: $filepath"
      sleep 5
    fi
  done < "$PLAYLIST_FILE"

  echo "Fim da playlist. Reiniciando o loop em 3 segundos..."
  sleep 3
done
