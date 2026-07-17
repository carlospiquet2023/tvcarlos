# EduVault — Guia de Deploy em Produção

Guia de referência para um deploy em VPS Linux. Dimensione o ambiente a partir de SLO, simultaneidade observada, perfil de mídia e testes de carga; os números abaixo são pontos iniciais, não garantia de capacidade.

---

## Requisitos do Servidor

| Componente | Ponto de partida | Critério de ajuste |
|---|---:|---|
| CPU | 4 vCPUs | latência e saturação da API/worker |
| RAM | 4 GB | RSS, cache e concorrência FFmpeg |
| Disco | 50 GB SSD | catálogo, retenção e derivados HLS |
| OS | Ubuntu LTS suportado | janela de segurança da distribuição |
| Banda | 100 Mbps | bitrate × espectadores simultâneos |

---

## 1. Preparação do Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências essenciais
sudo apt install -y curl git build-essential

# Node.js 22 LTS (faixa exigida por package.json)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (gerenciamento de processos)
sudo npm install -g pm2

# FFmpeg (processamento de vídeo HLS)
sudo apt install -y ffmpeg

# Nginx (reverse proxy)
sudo apt install -y nginx

# PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-client-16
```

---

## 2. Banco de Dados PostgreSQL

### 2.1 Criar banco e usuário

```bash
sudo -u postgres psql
```

```sql
CREATE USER eduvault WITH PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE eduvault OWNER eduvault;
GRANT ALL PRIVILEGES ON DATABASE eduvault TO eduvault;
\q
```

### 2.2 Aplicar tuning de performance

```bash
# Copiar arquivo de tuning
sudo cp deploy/postgresql.conf /etc/postgresql/16/main/conf.d/eduvault.conf
sudo systemctl restart postgresql
```

O arquivo `deploy/postgresql.conf` já está configurado para 4GB RAM + SSD.
Se o servidor tiver 8GB+, dobre `shared_buffers` e `effective_cache_size`.

### 2.3 Configurar pg_hba.conf (conexão local)

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Garantir que existe:
```
local   eduvault   eduvault   scram-sha-256
```

---

## 3. Deploy da Aplicação

### 3.1 Clonar o projeto

```bash
cd /var/www
git clone SEU_REPOSITORIO eduvault-app
cd eduvault-app
```

### 3.2 Criar diretórios de dados

```bash
# Diretório para uploads (fora do código-fonte)
sudo mkdir -p /var/www/eduvault-data/uploads/{videos,hls,images,pdfs}
sudo chown -R $USER:$USER /var/www/eduvault-data

# Diretório para logs do PM2
mkdir -p /var/www/eduvault-app/logs
```

### 3.3 Variáveis de ambiente

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

```env
# Banco de dados
DATABASE_URL="postgresql://eduvault:SENHA_FORTE_AQUI@localhost:5432/eduvault"

# JWT (gerar chave aleatória)
JWT_SECRET="$(openssl rand -base64 48)"

# Storage (caminhos absolutos)
VIDEO_STORAGE_PATH="/var/www/eduvault-data/uploads/videos"
HLS_STORAGE_PATH="/var/www/eduvault-data/uploads/hls"
IMAGE_STORAGE_PATH="/var/www/eduvault-data/uploads/images"
PDF_STORAGE_PATH="/var/www/eduvault-data/uploads/pdfs"

# Servidor
PORT=4000
FRONTEND_URL="https://seudominio.com.br"
NODE_ENV="production"
```

### 3.4 Instalar dependências e build

```bash
# Backend
cd backend
npm ci --production=false   # Inclui devDeps para build
npx prisma generate
npx prisma migrate deploy   # Aplica migrações em produção
npm run build               # Compila TypeScript
cd ..

# Frontend
cd frontend
npm ci
npm run build               # Gera dist/
cd ..
```

### 3.5 Copiar frontend build para Nginx

```bash
sudo mkdir -p /var/www/eduvault
sudo cp -r frontend/dist/* /var/www/eduvault/
sudo chown -R www-data:www-data /var/www/eduvault
```

### 3.6 Seed do banco (admin inicial)

```bash
cd backend
npx prisma db seed
cd ..
```

---

## 4. PM2 — Gerenciamento de Processos

### 4.1 Iniciar com ecosystem.config.js

```bash
cd /var/www/eduvault-app
pm2 start ecosystem.config.js

# Verificar se está rodando
pm2 status
pm2 logs --lines 50
```

### 4.2 Auto-start no boot

```bash
pm2 startup                  # Gera comando sudo para systemd
# Execute o comando que ele imprimir

pm2 save                     # Salva estado atual
```

### 4.3 Monitoramento

```bash
pm2 monit                   # Dashboard em tempo real
pm2 status                  # Status de todos os processos
pm2 logs eduvault-api        # Logs do cluster API
pm2 logs eduvault-worker     # Logs do processador de vídeo
```

---

## 5. Nginx — Reverse Proxy

### 5.1 Instalar configuração

```bash
sudo cp nginx.conf /etc/nginx/sites-available/eduvault
sudo ln -s /etc/nginx/sites-available/eduvault /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove config padrão

# Editar domínio e caminhos
sudo nano /etc/nginx/sites-available/eduvault
```

**Alterar no nginx.conf:**
- `seudominio.com.br` → seu domínio real
- `/var/www/eduvault-data/uploads/hls/` → caminho real dos HLS
- `/var/www/eduvault-data/uploads/images/` → caminho real das imagens
- CORS origin → seu domínio real

### 5.2 Testar e ativar

```bash
sudo nginx -t                # Testar configuração
sudo systemctl reload nginx
sudo systemctl enable nginx  # Auto-start no boot
```

### 5.3 SSL com Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com.br

# Renovação automática (certbot instala cron automaticamente)
sudo certbot renew --dry-run  # Testar renovação
```

---

## 6. Firewall

```bash
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 80/tcp       # HTTP (redirect)
sudo ufw allow 443/tcp      # HTTPS
sudo ufw enable
sudo ufw status
```

---

## 7. Backups

### 7.1 Backup do banco (cron diário)

```bash
sudo nano /etc/cron.d/eduvault-backup
```

```cron
# Backup diário às 3h da manhã
0 3 * * * postgres pg_dump -Fc eduvault > /var/backups/eduvault/db-$(date +\%Y\%m\%d).dump 2>> /var/log/eduvault-backup.log

# Limpar backups com mais de 30 dias
0 4 * * * root find /var/backups/eduvault -name "*.dump" -mtime +30 -delete
```

```bash
sudo mkdir -p /var/backups/eduvault
sudo chown postgres:postgres /var/backups/eduvault
```

### 7.2 Backup dos uploads

```bash
# rsync para disco externo ou S3
rsync -avz /var/www/eduvault-data/uploads/ /backup/eduvault-uploads/
```

---

## 8. Monitoramento em Produção

### Health check (deve retornar 200)
```bash
curl -s https://seudominio.com.br/ | jq
# {"status":"healthy","database":"connected","pgboss":"active","uptime":12345}
```

### Métricas da aplicação
```bash
curl -s https://seudominio.com.br/api/metrics | jq
# {"uptime":12345,"memory":{"rss":"150MB","heapUsed":"80MB"},...}
```

### Logs em tempo real
```bash
pm2 logs                     # Todos os processos
pm2 logs eduvault-api        # Só API
tail -f /var/log/nginx/eduvault-error.log  # Erros do Nginx
```

### Recursos do servidor
```bash
htop                         # CPU/RAM em tempo real
df -h                        # Espaço em disco
iostat -x 1                  # I/O do disco
```

---

## 9. Deploy de Atualizações

### 9.1 Deploy padrão

```bash
cd /var/www/eduvault-app

# Criar tag de backup pré-deploy (para rollback)
git tag "pre-deploy-$(date +%Y%m%d-%H%M)"

# Baixar atualizações
git pull origin main

# Backend
cd backend
npm ci --production=false
npx prisma migrate deploy
npm run build
cd ..

# Frontend
cd frontend
npm ci
npm run build
sudo cp -r dist/* /var/www/eduvault/
cd ..

# Restart sem downtime (PM2 graceful reload)
pm2 reload ecosystem.config.js

# Verificar saúde pós-deploy
curl -s https://seudominio.com.br/ | jq .status
```

### 9.2 Rollback de Deploy com Erro

Se o deploy causou bugs críticos:

```bash
cd /var/www/eduvault-app

# 1. Listar tags de backup pré-deploy
git tag -l "pre-deploy-*" | tail -5

# 2. Voltar para última versão estável
git reset --hard pre-deploy-YYYYMMDD-HHMM

# 3. Rebuild
cd backend && npm ci --production=false && npm run build && cd ..
cd frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/eduvault/ && cd ..

# 4. Restart
pm2 reload ecosystem.config.js

# 5. Verificar
curl -s https://seudominio.com.br/ | jq .status
```

### 9.3 Rollback de Migrações de Banco

```bash
cd /var/www/eduvault-app/backend

# Marcar migração como revertida
npx prisma migrate resolve --rolled-back NOME_DA_MIGRATION

# Se necessário, restaurar backup do banco
pm2 stop all
pg_restore -U postgres -d eduvault --clean --if-exists /var/backups/eduvault/db-YYYYMMDD.dump
pm2 restart all
```

### 9.4 Teste Automático de Restauração de Backup

Script que verifica semanalmente se o backup pode ser restaurado:

```bash
# Instalar script de teste
sudo cp deploy/test-backup-restore.sh /usr/local/bin/test-backup-restore.sh
sudo chmod +x /usr/local/bin/test-backup-restore.sh

# Agendar teste semanal (segunda-feira às 5h)
echo "0 5 * * 1 root /usr/local/bin/test-backup-restore.sh >> /var/log/eduvault-backup-test.log 2>&1" \
  | sudo tee /etc/cron.d/eduvault-backup-test

# Executar manualmente para validar
sudo bash deploy/test-backup-restore.sh
```

O script:
- Encontra o backup `.dump` mais recente
- Restaura em banco temporário `eduvault_restore_test`
- Valida tabelas críticas (User, Course, Video, CourseEnrollment, LessonComment, ForumViolation, ForumBan, ForumAppeal)
- Detecta vídeos órfãos (integridade referencial)
- Alerta se backup tem mais de 48h
- Limpa banco temporário ao final

---

## 10. Troubleshooting

| Problema | Diagnóstico | Solução |
|----------|-------------|---------|
| 502 Bad Gateway | `pm2 status` — backend caiu | `pm2 restart all` |
| Vídeo não processa | `pm2 logs eduvault-worker` | Verificar FFmpeg: `ffmpeg -version` |
| Upload falha | Nginx: `client_max_body_size` | Aumentar no nginx.conf |
| Conexão recusada DB | `pg_isready` | `sudo systemctl start postgresql` |
| Disco cheio | `df -h` + `du -sh uploads/*` | Limpar vídeos originais processados |
| Lento sob carga | `pm2 monit` + slow query log | Verificar queries > 500ms no PG log |
| SSL expirado | `certbot certificates` | `sudo certbot renew` |
| HLS 403/404 | Permissões do diretório | `sudo chown -R www-data uploads/hls` |

---

## Arquitetura Final em Produção

```
Internet
   │
   ▼
┌──────────────────────────────────────┐
│  Nginx (porta 443)                   │
│  ├─ /            → frontend SPA      │
│  ├─ /api/*       → proxy → Node:4000 │
│  ├─ /hls/*       → disco (direto)    │ ← 70% menos carga no Node
│  ├─ /images/*    → disco (direto)    │
│  └─ /pdfs/*      → proxy → Node:4000 │ ← requer auth JWT
└──────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────┐
│  PM2 Cluster                         │
│  ├─ eduvault-api ×N (cluster mode)   │ ← N = número de CPUs
│  └─ eduvault-worker ×1 (fork mode)   │ ← FFmpeg + pg-boss
└──────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────┐
│  PostgreSQL 16                       │
│  └─ Tuning p/ 10k (deploy/pg.conf)  │
└──────────────────────────────────────┘
```
