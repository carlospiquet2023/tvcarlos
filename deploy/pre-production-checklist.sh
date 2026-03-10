#!/bin/bash
# ============================================================
# pre-production-checklist.sh — Validação Pré-Produção EduVault v10.0
# ============================================================
#
# Rode no servidor ANTES de liberar para produção.
# Verifica que todos os componentes críticos estão configurados.
#
# USO:
#   sudo bash deploy/pre-production-checklist.sh
#
# ============================================================

set -u

PASS=0
FAIL=0
WARN=0

check() {
    local label="$1"
    shift
    if eval "$@" > /dev/null 2>&1; then
        echo "  ✅ $label"
        ((PASS++))
    else
        echo "  ❌ $label"
        ((FAIL++))
    fi
}

warn() {
    local label="$1"
    shift
    if eval "$@" > /dev/null 2>&1; then
        echo "  ✅ $label"
        ((PASS++))
    else
        echo "  ⚠️  $label (recomendado)"
        ((WARN++))
    fi
}

echo ""
echo "=========================================="
echo "  EduVault v10.0 — Checklist Pré-Produção"
echo "=========================================="
echo ""

# --- Infraestrutura ---
echo "🔧 Infraestrutura"
check "Nginx rodando"                "systemctl is-active --quiet nginx"
check "Nginx config válida"          "nginx -t 2>&1"
check "PostgreSQL rodando"           "systemctl is-active --quiet postgresql"
check "PM2 rodando"                  "command -v pm2 && pm2 pid > /dev/null 2>&1"
check "Node.js instalado"            "command -v node"
check "FFmpeg instalado"             "command -v ffmpeg"
echo ""

# --- Aplicação ---
echo "🚀 Aplicação"
check "Backend respondendo"          "curl -sf http://localhost:4000/ | grep -q 'status'"
check "Health check avançado"        "curl -sf http://localhost:4000/ | grep -qE '\"(healthy|degraded)\"'"
check "Frontend build existe"        "test -d /var/www/eduvault && test -f /var/www/eduvault/index.html"
check "PM2 eduvault-api online"      "pm2 show eduvault-api 2>/dev/null | grep -q 'online'"
check "PM2 eduvault-worker online"   "pm2 show eduvault-worker 2>/dev/null | grep -q 'online'"
echo ""

# --- Segurança ---
echo "🔒 Segurança"
check "SSL certificado válido"       "certbot certificates 2>/dev/null | grep -q 'VALID'"
check "Firewall UFW ativo"           "ufw status | grep -q 'active'"
check "Rate limiting no Nginx"       "grep -q 'limit_req_zone' /etc/nginx/sites-available/eduvault 2>/dev/null || grep -q 'limit_req_zone' /etc/nginx/sites-enabled/eduvault 2>/dev/null"
check "JWT_SECRET definido"          "pm2 env 0 2>/dev/null | grep -q 'JWT_SECRET'"
echo ""

# --- Backups ---
echo "💾 Backups"
check "Diretório de backup existe"   "test -d /var/backups/eduvault"
check "Backup cron agendado"         "crontab -l -u postgres 2>/dev/null | grep -q 'pg_dump.*eduvault'"
check "Script de teste de backup"    "test -x /usr/local/bin/test-backup-restore.sh"
echo ""

# --- Monitoramento ---
echo "📊 Monitoramento"
check "PM2 auto-start configurado"   "pm2 startup -u \$(whoami) --hp \$HOME 2>&1 | grep -q 'already' || systemctl is-enabled pm2-\$(whoami) 2>/dev/null"
warn  "PM2 log rotation instalado"   "pm2 ls 2>/dev/null | grep -q 'pm2-logrotate'"
warn  "Uptime Kuma rodando"          "curl -sf http://localhost:3001 > /dev/null 2>&1"
echo ""

# --- CloudFlare (opcional) ---
echo "☁️  CloudFlare (opcional)"
warn  "CloudFlare proxy ativo"       "curl -sI https://\$(hostname -f) 2>&1 | grep -qi 'cf-ray'"
warn  "CloudFlare Real IP no Nginx"  "grep -q 'real_ip_header.*CF-Connecting-IP' /etc/nginx/sites-available/eduvault 2>/dev/null || test -f /etc/nginx/conf.d/cloudflare-real-ip.conf"
echo ""

# --- Resultado ---
echo "=========================================="
TOTAL=$((PASS + FAIL + WARN))
echo "  Resultado: $PASS/$TOTAL aprovados"
if [ "$FAIL" -gt 0 ]; then
    echo "  ❌ $FAIL itens FALHARAM — corrigir antes de produção!"
fi
if [ "$WARN" -gt 0 ]; then
    echo "  ⚠️  $WARN itens recomendados pendentes"
fi
if [ "$FAIL" -eq 0 ]; then
    echo ""
    echo "  → APROVADO PARA PRODUÇÃO! 🚀"
fi
echo "=========================================="
echo ""
