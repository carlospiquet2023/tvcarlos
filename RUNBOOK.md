# RUNBOOK — EduVault Incident Response

> **Regra #1:** Às 3h da manhã, siga o checklist. Não tente debuggar no escuro.
> **Regra #2:** Sempre verifique os logs ANTES de reiniciar qualquer serviço.
> **Regra #3:** Documente o que aconteceu após resolver.

---

## Tabela de Severidades

| Nível | Nome | Exemplo | Tempo de Resposta |
|-------|------|---------|-------------------|
| **P1** | Crítico | Site fora do ar, dados corrompidos | Imediato |
| **P2** | Alto | Login quebrado, vídeos não carregam | < 1 hora |
| **P3** | Médio | Upload lento, UI com bug visual | < 4 horas |
| **P4** | Baixo | Typo no texto, feature request | Próximo dia útil |

---

## Comandos de Diagnóstico Rápido (copiar e colar)

```bash
# Status geral — rode tudo de uma vez
echo "=== DISCO ===" && df -h / && \
echo "=== RAM ===" && free -m && \
echo "=== PM2 ===" && pm2 status && \
echo "=== NGINX ===" && systemctl status nginx --no-pager && \
echo "=== POSTGRES ===" && systemctl status postgresql --no-pager && \
echo "=== HEALTH ===" && curl -s http://localhost:4000/ | head -c 200
```

```bash
# Logs dos últimos 5 minutos
pm2 logs --lines 100 --nostream
journalctl -u nginx --since "5 minutes ago" --no-pager
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## Incidente: Site Completamente Fora do Ar (P1)

### Sintomas
- Uptime Kuma alerta: Health Check DOWN
- Usuários reportam "não consigo acessar"
- `curl https://seudominio.com.br` retorna timeout ou 502/503

### Diagnóstico (ordem de verificação)
```bash
# 1. O servidor está acessível?
ping seudominio.com.br

# 2. Nginx está rodando?
sudo systemctl status nginx

# 3. Node.js (PM2) está rodando?
pm2 status

# 4. PostgreSQL está rodando?
sudo systemctl status postgresql

# 5. Health check do Node
curl -s http://localhost:4000/ | python3 -m json.tool

# 6. Disco cheio?
df -h /

# 7. RAM esgotada?
free -m
```

### Ações (faça na ordem até resolver)

| # | Ação | Comando |
|---|------|---------|
| 1 | Reiniciar Nginx | `sudo systemctl restart nginx` |
| 2 | Reiniciar PM2 (Node) | `pm2 restart all` |
| 3 | Reiniciar PostgreSQL | `sudo systemctl restart postgresql` |
| 4 | Verificar se porta 4000 está ocupada | `sudo lsof -i :4000` |
| 5 | Verificar logs de erro do Node | `pm2 logs --err --lines 200 --nostream` |
| 6 | Verificar logs do Nginx | `sudo tail -100 /var/log/nginx/eduvault-error.log` |
| 7 | Se disco cheio: limpar logs antigos | `pm2 flush && sudo journalctl --vacuum-time=2d` |
| 8 | Se RAM esgotada: matar processos zumbis | `pm2 restart all --update-env` |

---

## Incidente: Login Não Funciona (P2)

### Sintomas
- Usuário digita credenciais corretas e recebe "Erro ao fazer login"
- API retorna 500 em `/api/auth/login`

### Diagnóstico
```bash
# Testar login direto
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eduvault.com","password":"SuaSenha123"}'

# Verificar conexão com banco
sudo -u postgres psql -d eduvault -c "SELECT id, email FROM \"User\" LIMIT 3;"

# Verificar JWT_SECRET
pm2 env 0 | grep JWT_SECRET
```

### Ações
| # | Ação | Comando |
|---|------|---------|
| 1 | Verificar se PostgreSQL está online | `sudo systemctl status postgresql` |
| 2 | Testar conexão sem alterar schema | `psql "$DATABASE_URL" -c "SELECT 1"` |
| 3 | Verificar variáveis de ambiente | `pm2 env 0` (checar DATABASE_URL, JWT_SECRET) |
| 4 | Restart se variáveis estão OK | `pm2 restart all` |
| 5 | Se erro de migration | `cd /app/backend && npx prisma migrate status`; interromper deploy, corrigir a migration e restaurar backup se necessário. Nunca usar `db push` em produção |

---

## Incidente: Vídeos Não Carregam (P2)

### Sintomas
- Player mostra "Aguardando processamento" indefinidamente
- HLS .m3u8 retorna 404 ou 403
- Vídeo fica em status PROCESSING por mais de 1 hora

### Diagnóstico
```bash
# Verificar status dos vídeos no banco
sudo -u postgres psql -d eduvault -c \
  "SELECT status, count(*) FROM \"Video\" GROUP BY status;"

# Verificar fila de processamento (pg-boss)
sudo -u postgres psql -d eduvault -c \
  "SELECT name, state, count(*) FROM pgboss.job GROUP BY name, state;"

# Verificar se FFmpeg está no PATH
which ffmpeg && ffmpeg -version | head -1

# Verificar se há processos FFmpeg rodando
ps aux | grep ffmpeg

# Verificar espaço em disco (HLS consome bastante)
du -sh /var/www/eduvault-data/uploads/hls/
df -h /
```

### Ações
| # | Ação | Quando |
|---|------|--------|
| 1 | Se FFmpeg não encontrado | `sudo apt install ffmpeg` |
| 2 | Se disco > 90% | Limpar vídeos mp4 originais antigos já convertidos |
| 3 | Se job travado em PROCESSING | Reprocessar pelo admin: `POST /api/admin/videos/:id/reprocess` |
| 4 | Se worker morto | `pm2 restart eduvault-worker` |
| 5 | Se muitos erros | Verificar `pm2 logs eduvault-worker --err --lines 200` |
| 6 | Jobs ativos há mais de 2h | preservar logs e job ID; reiniciar o worker e usar o fluxo de reprocessamento. Não editar tabelas internas do pg-boss manualmente |

---

## Incidente: Site Lento / Timeout (P2)

### Sintomas
- Páginas demoram mais de 5 segundos para carregar
- Uptime Kuma mostra latência alta
- Usuários reportam "travando"

### Diagnóstico
```bash
# CPU e RAM
htop   # ou: top -bn1 | head -20

# Conexões ativas ao PostgreSQL
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Slow queries
sudo -u postgres psql -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 seconds' ORDER BY duration DESC LIMIT 5;"

# Conexões ao Node
ss -tlnp | grep 4000

# Nginx connections
ss -s
```

### Ações
| # | Condição | Ação |
|---|----------|------|
| 1 | CPU > 90% por FFmpeg | Esperar processamento acabar ou `pm2 restart eduvault-worker` |
| 2 | RAM > 90% | `pm2 restart all` (libera memória dos processos Node) |
| 3 | Muitas slow queries | inspecionar `pg_stat_activity` e o slow query log; cancelar somente o PID confirmado, preservando transações críticas |
| 4 | Pool de conexões lotado | Verificar `connection_limit` na DATABASE_URL (recomendado: 20) |
| 5 | Disco lento (VPS barata) | Considerar migrar para SSD ou otimizar queries |

---

## Incidente: Erro 502 Bad Gateway (P1)

### Sintomas
- Nginx retorna 502 em toda request
- Site estático funciona, API não

### Causa Raiz
Node.js (PM2) caiu e o Nginx não consegue fazer proxy.

### Ação Imediata
```bash
pm2 status                    # Verificar se processos estão "online"
pm2 restart all               # Reiniciar tudo
pm2 logs --err --lines 50     # Se reiniciou e caiu de novo, ver o erro
```

---

## Incidente: Certificado SSL Expirado (P1)

### Sintomas
- Browser mostra "Conexão não é privada"
- Uptime Kuma alerta certificate expiring

### Ação Imediata
```bash
# Verificar validade
sudo certbot certificates

# Renovar
sudo certbot renew --force-renewal

# Se falhar, verificar que Nginx está parado na porta 80
sudo systemctl stop nginx
sudo certbot renew --standalone
sudo systemctl start nginx
```

### Prevenção
```bash
# Cron automático (já deve existir se instalou via certbot)
sudo crontab -l | grep certbot
# Se não existir:
echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'" | sudo crontab -
```

---

## Incidente: Disco Cheio (P2)

### Sintomas
- Uploads falham, vídeos não processam
- PostgreSQL para de aceitar writes
- `df -h /` mostra 100%

### Ação Imediata
```bash
# O que está consumindo mais?
du -sh /var/www/eduvault-data/uploads/* | sort -rh

# Limpar logs antigos
pm2 flush
sudo journalctl --vacuum-time=3d

# Limpar mp4 originais já convertidos para HLS
# CUIDADO: só remova se o HLS correspondente existe
ls -lhS /var/www/eduvault-data/uploads/videos/ | head -20

# Limpar jobs antigos do pg-boss
sudo -u postgres psql -d eduvault -c \
  "DELETE FROM pgboss.archive WHERE archivedon < now() - interval '30 days';"
```

---

## Incidente: Ataque DDoS (P1)

### Sintomas
- Tráfego anormal > 10x o normal
- CloudFlare dashboard mostra spike de ameaças
- Uptime Kuma mostra latência > 5s
- Nginx error log cheio de `limiting requests`
- CPU/RAM do servidor normal (ataque absorvido pelo CloudFlare) ou saturado (bypass)

### Diagnóstico
```bash
# Verificar se CloudFlare está absorvendo
curl -I https://seudominio.com.br 2>&1 | grep cf-ray
# Se cf-ray existe → tráfego passa pelo CloudFlare

# Requests por segundo no Nginx
sudo tail -10000 /var/log/nginx/eduvault-access.log | awk '{print $4}' | cut -d: -f1-3 | uniq -c | sort -rn | head -5

# IPs mais frequentes (se bypass)
sudo awk '{print $1}' /var/log/nginx/eduvault-access.log | sort | uniq -c | sort -rn | head -20

# Conexões TCP ativas
ss -s
```

### Ação Imediata
| # | Ação | Como |
|---|------|------|
| 1 | Ativar "Under Attack Mode" no CloudFlare | Dashboard → Security → Settings → Security Level → **"I'm Under Attack"** |
| 2 | Monitorar CloudFlare Analytics | Dashboard → Analytics → Threats blocked |
| 3 | Se persistir: bloquear países | Firewall Rules → Expression: `(ip.geoip.country in {"XX" "YY"})` → Block |
| 4 | Se bypass direto ao IP do servidor | `sudo ufw deny from ATTACKER_IP` ou bloquear range |
| 5 | Se Nginx saturado | `sudo systemctl restart nginx` + verificar rate limiting |
| 6 | Após mitigação: voltar Security Level | CloudFlare → Security → Settings → Security Level → **"Medium"** |

### Prevenção
- Servidor nunca expor IP real (sempre atrás do CloudFlare proxy)
- Manter `set_real_ip_from` atualizado no nginx.conf
- Firewall UFW deve aceitar **apenas** IPs do CloudFlare na porta 443

---

## Incidente: Rate Limit Atingido por Usuários Legítimos (P3)

### Sintomas
- Alunos reportam "429 Too Many Requests"
- Aulas normais rejeitadas pelo Nginx

### Diagnóstico
```bash
# Ver quantas requests estão sendo limitadas
sudo grep "limiting requests" /var/log/nginx/eduvault-error.log | tail -20

# Ver IPs mais frequentes
sudo awk '{print $1}' /var/log/nginx/eduvault-access.log | sort | uniq -c | sort -rn | head -20
```

### Ação
1. Se são usuários reais em massa: aumentar o `burst` no `nginx.conf`
2. Se é 1 IP fazendo muitas requests: provavelmente bot — bloquear
3. Se é CloudFlare: verificar se `real_ip_header CF-Connecting-IP` está ativo

---

## Incidente: Aula ao Vivo / Zoom Não Abre (P3)

### Sintomas
- Aluno clica "Entrar no Zoom" e nada acontece
- Link do Zoom expirado ou inválido

### Ação
1. Verificar se o admin inseriu o link correto (deve começar com `https://zoom.us/j/` ou `https://us0X.zoom.us/j/`)
2. Verificar se o status da aula está como SCHEDULED ou LIVE (não ENDED)
3. Se o link expirou: admin atualiza o link no painel → aba Aulas ao Vivo → editar
4. O Zoom gera links novos para cada reunião — o admin precisa atualizar manualmente

---

## Backup & Restauração

### Backup do Banco (diário)
```bash
# Criar backup
pg_dump -U postgres -d eduvault -Fc -f /backups/eduvault_$(date +%Y%m%d_%H%M%S).dump

# Cron (diário às 2h)
0 2 * * * pg_dump -U postgres -d eduvault -Fc -f /backups/eduvault_$(date +\%Y\%m\%d).dump && find /backups -name "eduvault_*.dump" -mtime +30 -delete
```

### Restaurar Backup
```bash
# ATENÇÃO: isso sobrescreve o banco atual!
pm2 stop all
pg_restore -U postgres -d eduvault --clean --if-exists /backups/eduvault_20260308.dump
pm2 restart all
```

### Backup de Uploads (vídeos HLS + imagens)
```bash
# rsync para outro servidor ou bucket S3
rsync -avz --progress /var/www/eduvault-data/uploads/ backup-server:/eduvault-uploads/
```

---

## Incidente: Spam/Abuso no Fórum (P3)

**Sintomas:** Flood de comentários, conteúdo ofensivo em massa, alunos reclamando do fórum.

### 1. Diagnóstico
```bash
# Ver violações recentes (últimas 24h)
sudo -u postgres psql -d eduvault -c "SELECT * FROM \"ForumViolation\" WHERE \"createdAt\" > NOW() - INTERVAL '24 hours' ORDER BY \"createdAt\" DESC LIMIT 20;"

# Ver bans ativos
sudo -u postgres psql -d eduvault -c "SELECT fb.*, u.name, u.email FROM \"ForumBan\" fb JOIN \"User\" u ON fb.\"userId\" = u.id WHERE fb.active = true;"

# Contar comentários flagrados
sudo -u postgres psql -d eduvault -c "SELECT count(*) FROM \"LessonComment\" WHERE flagged = true;"
```

### 2. Ações
1. **Se punições automáticas estão desativadas:** Ativar via Admin → Punições → Toggle
2. **Se ataque de vários alunos:** Aplicar ban manual pelo Admin → Punições → Ban Manual
3. **Se ataque via conta fake:** Deletar usuário via Admin → Usuários
4. **Se flood extremo:** Desativar comentários por aula: `PUT /api/admin/videos/:id/comments-toggle`
5. **Se necessário limpar em massa:**
```bash
# Deletar todos os comentários flagrados
sudo -u postgres psql -d eduvault -c "DELETE FROM \"LessonComment\" WHERE flagged = true;"
```

### 3. Prevenção
- Manter `forumPunishmentEnabled = true` sempre em produção
- Revisar periodicamente Admin → Moderação (comentários flagrados)
- Monitorar Admin → Punições → Recursos para tratar apelações pendentes

---

## Incidente: Presença Não Está Sendo Registrada (P3)

### Sintomas
- Alunos assistem vídeos mas não aparecem como presentes na lista
- Heartbeat não está sendo enviado
- Admin não vê registros de presença

### Diagnóstico
```bash
# Verificar se presença está ativada
sudo -u postgres psql -d eduvault -c "SELECT \"attendanceEnabled\", \"attendanceMinMinutes\", \"attendanceMode\" FROM \"PlatformConfig\" LIMIT 1;"

# Verificar registros de presença recentes
sudo -u postgres psql -d eduvault -c "SELECT a.*, u.name, m.name as module FROM \"Attendance\" a JOIN \"User\" u ON a.\"userId\" = u.id JOIN \"Module\" m ON a.\"moduleId\" = m.id ORDER BY a.\"createdAt\" DESC LIMIT 20;"

# Verificar edições de presença (audit trail)
sudo -u postgres psql -d eduvault -c "SELECT ae.*, u.name as editor FROM \"AttendanceEdit\" ae JOIN \"User\" u ON ae.\"editedByUserId\" = u.id ORDER BY ae.\"createdAt\" DESC LIMIT 10;"

# Verificar contagem de heartbeats por módulo hoje
sudo -u postgres psql -d eduvault -c "SELECT m.name, a.status, count(*) FROM \"Attendance\" a JOIN \"Module\" m ON a.\"moduleId\" = m.id WHERE a.date = CURRENT_DATE GROUP BY m.name, a.status;"
```

### Ações
| # | Condição | Ação |
|---|----------|------|
| 1 | `attendanceEnabled = false` | Ativar via Admin → Presença → Toggle |
| 2 | Tempo mínimo muito alto | Reduzir `attendanceMinMinutes` (padrão: 20) |
| 3 | Heartbeat não chega ao backend | Verificar console do navegador (F12) → erros em POST /attendance/heartbeat |
| 4 | Aluno não está matriculado | Verificar matrícula no curso do módulo |
| 5 | Modo DATE_ONLY e aluno assistiu em outro dia | Mudar para modo FREE ou orientar aluno a assistir no dia correto |
| 6 | Registros incorretos | Admin edita via Presença → botão editar → justificativa obrigatória |

---

## Checklist Pós-Incidente

- [ ] O que aconteceu? (timeline)
- [ ] Qual foi a causa raiz?
- [ ] Como foi detectado? (Uptime Kuma? Usuário reportou?)
- [ ] O tempo de detecção foi aceitável?
- [ ] O que fizemos para resolver?
- [ ] O que podemos fazer para evitar que aconteça de novo?
- [ ] Precisa de alguma mudança no monitoramento?

---

## Contatos de Emergência

| Quem | Quando contactar | Como |
|------|-------------------|------|
| Admin da plataforma | P1 e P2 | carlospiquet.projetos@gmail.com |
| Provedor de hosting | Servidor inacessível | Painel do provedor (ticket urgente) |
| CloudFlare | Ataque DDoS massivo | Dashboard CloudFlare → Under Attack Mode |
