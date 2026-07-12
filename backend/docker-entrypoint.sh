#!/bin/sh
set -e

MIGRATION_MODE="${MIGRATION_MODE:-deploy}"
INITIAL_MIGRATION="20260710210000_initial_unified_platform"

case "$MIGRATION_MODE" in
  deploy)
    schema_command() {
      ./node_modules/.bin/prisma migrate deploy
    }
    ;;
  push)
    if [ "${NODE_ENV:-development}" = "production" ] && [ "${ALLOW_SCHEMA_PUSH:-false}" != "true" ]; then
      echo "[backend] MIGRATION_MODE=push e bloqueado em producao; use migrate deploy"
      exit 1
    fi
    schema_command() {
      ./node_modules/.bin/prisma db push --skip-generate
    }
    ;;
  legacy-baseline)
    if [ "${ALLOW_LEGACY_BASELINE:-false}" != "true" ]; then
      echo "[backend] legacy-baseline exige ALLOW_LEGACY_BASELINE=true e backup validado"
      exit 1
    fi
    schema_command() {
      # Ponte unica para bancos antigos criados por `db push`: primeiro leva o
      # schema ao estado atual sem aceitar perda de dados e depois registra a
      # migration inicial como baseline. Nao use este modo em banco novo.
      ./node_modules/.bin/prisma db push --skip-generate \
        && ./node_modules/.bin/prisma migrate resolve --applied "$INITIAL_MIGRATION"
    }
    ;;
  *)
    echo "[backend] MIGRATION_MODE invalido: $MIGRATION_MODE (deploy, push ou legacy-baseline)"
    exit 1
    ;;
esac

echo "[backend] aguardando banco e aplicando schema em modo $MIGRATION_MODE..."

attempt=0
until schema_command; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[backend] falha de conexao/migracao apos 30 tentativas"
    exit 1
  fi
  echo "[backend] banco indisponivel ou migracao pendente de correcao, tentativa $attempt/30..."
  sleep 3
done

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[backend] executando seed inicial..."
  node dist/prisma/seed.js
fi

echo "[backend] iniciando API"
exec node dist/src/server.js
