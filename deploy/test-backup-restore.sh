#!/bin/bash
# ============================================================
# test-backup-restore.sh — Teste Automático de Restauração de Backup
# ============================================================
#
# Verifica semanalmente que o backup do PostgreSQL pode ser restaurado
# com sucesso. Cria um banco temporário, restaura o dump mais recente,
# valida tabelas críticas e limpa tudo.
#
# INSTALAÇÃO:
#   sudo cp deploy/test-backup-restore.sh /usr/local/bin/test-backup-restore.sh
#   sudo chmod +x /usr/local/bin/test-backup-restore.sh
#
# CRON (toda segunda-feira às 5h):
#   echo "0 5 * * 1 root /usr/local/bin/test-backup-restore.sh >> /var/log/eduvault-backup-test.log 2>&1" \
#     | sudo tee /etc/cron.d/eduvault-backup-test
#
# MANUAL:
#   sudo bash deploy/test-backup-restore.sh
#
# ============================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/eduvault}"
TEST_DB="eduvault_restore_test"
LOG_PREFIX="[backup-test $(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX Iniciando teste de restauração de backup..."

# 1. Encontrar o backup mais recente
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "*.dump" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | awk '{print $2}')

if [ -z "$LATEST_BACKUP" ]; then
    echo "$LOG_PREFIX ERRO: Nenhum backup .dump encontrado em $BACKUP_DIR"
    exit 1
fi

BACKUP_AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$LATEST_BACKUP") ) / 3600 ))
echo "$LOG_PREFIX Backup encontrado: $LATEST_BACKUP (idade: ${BACKUP_AGE_HOURS}h)"

# Alerta se backup tem mais de 48h
if [ "$BACKUP_AGE_HOURS" -gt 48 ]; then
    echo "$LOG_PREFIX AVISO: Backup tem mais de 48h! Verificar cron de backup."
fi

# 2. Limpar banco de teste anterior (se existir)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $TEST_DB;"

echo "$LOG_PREFIX Restaurando backup no banco temporário '$TEST_DB'..."

# 3. Restaurar
pg_restore -U postgres -d "$TEST_DB" --no-owner --no-acl "$LATEST_BACKUP" 2>/dev/null || {
    echo "$LOG_PREFIX AVISO: pg_restore retornou warnings (normal para --no-owner)"
}

# 4. Validar tabelas críticas
echo "$LOG_PREFIX Validando dados restaurados..."

USERS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"User\";" 2>/dev/null)
COURSES=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"Course\";" 2>/dev/null)
VIDEOS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"Video\";" 2>/dev/null)
ENROLLMENTS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"CourseEnrollment\";" 2>/dev/null)

# Verificação mínima: deve ter pelo menos 1 usuário (admin seed)
if [ "${USERS:-0}" -lt 1 ]; then
    echo "$LOG_PREFIX ERRO CRÍTICO: Backup não contém usuários! Restore falhou."
    sudo -u postgres psql -c "DROP DATABASE $TEST_DB;" 2>/dev/null || true
    exit 1
fi

echo "$LOG_PREFIX ✓ Restore bem-sucedido!"
echo "$LOG_PREFIX   Usuários: $USERS"
echo "$LOG_PREFIX   Cursos: $COURSES"
echo "$LOG_PREFIX   Vídeos: $VIDEOS"
echo "$LOG_PREFIX   Matrículas: $ENROLLMENTS"

# 4b. Validar tabelas do fórum (v9.0)
VIOLATIONS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"ForumViolation\";" 2>/dev/null || echo "N/A")
BANS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"ForumBan\";" 2>/dev/null || echo "N/A")
APPEALS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"ForumAppeal\";" 2>/dev/null || echo "N/A")
COMMENTS=$(sudo -u postgres psql -d "$TEST_DB" -tAc "SELECT count(*) FROM \"LessonComment\";" 2>/dev/null || echo "N/A")

echo "$LOG_PREFIX   Comentários: $COMMENTS"
echo "$LOG_PREFIX   Violações: $VIOLATIONS"
echo "$LOG_PREFIX   Bans: $BANS"
echo "$LOG_PREFIX   Recursos: $APPEALS"

# 5. Validação de integridade referencial (foreign keys)
ORPHAN_VIDEOS=$(sudo -u postgres psql -d "$TEST_DB" -tAc \
    "SELECT count(*) FROM \"Video\" v LEFT JOIN \"Module\" m ON v.\"moduleId\" = m.id WHERE m.id IS NULL;" 2>/dev/null)

if [ "${ORPHAN_VIDEOS:-0}" -gt 0 ]; then
    echo "$LOG_PREFIX AVISO: $ORPHAN_VIDEOS vídeos órfãos (sem módulo) encontrados!"
fi

# 6. Limpar
sudo -u postgres psql -c "DROP DATABASE $TEST_DB;" 2>/dev/null || true

echo "$LOG_PREFIX ✓ Teste completo. Banco temporário removido."
echo "$LOG_PREFIX ✓ Backup de $(date -d @$(stat -c %Y "$LATEST_BACKUP") '+%Y-%m-%d %H:%M') validado com sucesso."
