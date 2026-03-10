# Arquitetura do Projeto EduVault

## Visão Geral
Plataforma full-stack de hospedagem segura de vídeos educacionais com streaming HLS adaptativo, dashboard premium do aluno com progresso, editor de blocos drag-and-drop, materiais PDF por módulo, calendário por curso, painel administrativo completo com paginação e busca, importação de alunos via Excel, **sistema de branding dinâmico** (cores, logo e nome configuráveis pelo admin), **infraestrutura de produção para 10k+ alunos** (PM2 cluster, Nginx, PostgreSQL tuning), **módulo de aulas ao vivo** (integração Zoom), **ops & observabilidade** (Uptime Kuma, rate limiting Nginx, CloudFlare CDN, k6 load tests, runbook de incidentes), **production hardening** (health check avançado, PM2 log rotation, teste automático de backup, rollback strategy, incidente DDoS), **fórum por aula com sistema de punições** (comentários, denúncias, filtro de profanidade por severidade, bans automáticos/manuais, recursos do aluno, painel de moderação e punições no admin) e **sistema de presença automática** (heartbeat de vídeo a cada 30s, tempo mínimo configurável pelo admin, listas editáveis com auditoria de justificativa).

```
plataforma/
├── backend/                      # API Node.js/Express 5 + TypeScript
│   ├── prisma/
│   │   ├── schema.prisma         # Modelo do banco (PostgreSQL) — 17 modelos + índices otimizados
│   │   └── seed.ts               # Script idempotente de dados iniciais
│   ├── src/
│   │   ├── config/
│   │   │   └── pgBoss.ts         # Fila de background jobs (processamento de vídeo)
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Singleton do Prisma Client (log por ambiente)
│   │   │   ├── logger.ts         # Pino structured logging (nivel por ambiente)
│   │   │   └── profanityFilter.ts# Filtro de profanidade local (3 severidades: LIGHT/MEDIUM/SEVERE) com ~50 padrões
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts  # JWT: autenticação + controle de permissão por role
│   │   │   └── uploadMiddleware.ts# Multer: upload de vídeo com filtro e limite
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login, perfil (senha forte 8+ chars), stream-token
│   │   │   ├── admin.ts          # CRUD paginado: users, courses, modules, enrollments, videos, PDFs, imagens, Excel, config, moderação, punições, recursos, presença
│   │   │   ├── config.ts         # Rota pública de branding + flags do fórum + presença (cache em memória 1min)
│   │   │   ├── student.ts        # Meus cursos (batch otimizado), aula com PDF/calendário, progresso, fórum (comentários, denúncias, status de ban, recurso), heartbeat de presença
│   │   │   └── video.ts          # Upload + listagem de vídeos por módulo
│   │   ├── services/
│   │   │   └── videoProcessor.ts  # Worker FFmpeg: mp4 → HLS multi-qualidade com timeout 30min
│   │   ├── __tests__/
│   │   │   └── core.test.ts      # 18 testes (credenciais, headers, senha, cache, roles)
│   │   └── server.ts             # Entry point: Express, Helmet, CORS, Rate Limit, Health Check, Metrics, Graceful Shutdown
│   └── .env.example              # Template de variáveis de ambiente
│
├── frontend/                      # React 19 + Vite 7 + TypeScript
│   └── src/
│       ├── components/
│       │   ├── BlockEditor.tsx   # Editor de blocos drag-and-drop (texto, imagem, destaque) + 25 fontes + cor de fundo
│       │   ├── LessonComments.tsx# Fórum de comentários por aula: polling 5s, respostas, denúncias, modal de violação, banner de ban, recurso
│       │   ├── ProtectedRoute.tsx # Guard de rotas: redireciona por role (admin/student)
│       │   └── VideoPlayer.tsx   # Player video.js + HLS + watermark + progresso automático + heartbeat de presença
│       ├── context/
│       │   ├── AuthContext.tsx    # Estado global de autenticação (React Context)
│       │   └── ConfigContext.tsx  # Branding dinâmico: aplica cores, logo e nome via CSS vars
│       ├── lib/
│       │   └── api.ts            # Instância Axios configurada com baseURL
│       ├── pages/
│       │   ├── Login.tsx         # Tela de login (username ou e-mail) — logo e nome dinâmicos
│       │   ├── AdminDashboard.tsx# Painel admin: users, cursos, módulos, PDFs, editor de blocos, Excel, branding, moderação, punições, presença
│       │   ├── StudentDashboard.tsx# Dashboard aluno: carrossel Netflix, busca, progresso
│       │   └── LessonPage.tsx    # Página da aula: vídeo + blocos + anotações + downloads + fórum de comentários
│       ├── App.tsx               # Roteamento principal (React Router) — ConfigProvider global
│       └── index.css             # Design system completo (CSS vars dinâmicas, 25 fontes Google)
│
├── deploy/                        # Configurações de infraestrutura
│   ├── postgresql.conf           # Tuning PostgreSQL para 10k+ (SSD, shared_buffers, slow query log)
│   ├── docker-compose.monitoring.yml # Uptime Kuma (monitoramento self-hosted)
│   └── test-backup-restore.sh    # Teste automático de restauração de backup (cron semanal)
├── k6/                            # Testes de carga
│   ├── load-test.js              # Suite completa: smoke (5 VUs), load (100), stress (300), spike (500)
│   └── smoke-test.js             # Smoke test rápido pré-deploy (5 VUs, 15s)
├── ecosystem.config.js            # PM2: cluster mode (N cores) + 1 fork worker (pg-boss/FFmpeg)
├── nginx.conf                     # Nginx: reverse proxy, SSL, gzip, HLS, rate limiting (4 zonas), CloudFlare Real IP
├── CLOUDFLARE.md                  # Guia completo de configuração CloudFlare (Free tier)
├── DEPLOY.md                      # Guia completo de deploy em produção (10k+)
├── RUNBOOK.md                     # Runbook de incidentes (8 cenários de falha + backup + pós-mortem)
├── ARCHITECTURE.md                # Este arquivo
├── INICIAR_PROJETO.bat            # Script Windows para dev local (backend + frontend)
├── LICENSE                        # Licença proprietária restritiva
└── README.md                      # Documentação técnica e instruções
```

## Fluxo de Dados

```
[Admin cria curso (+ thumbnail + calendário PDF) / módulo (+ PDF material) / vídeo]
         │
         ▼
   Banco PostgreSQL (Prisma ORM — connection pool 20)
         │
         ├── Upload vídeo → Multer salva mp4 → pg-boss enfileira
         │                                          │
         │                                    FFmpeg Worker (timeout 30min/qualidade)
         │                                   converte → HLS adaptativo
         │                                   (.m3u8 + .ts — 360p/720p/1080p)
         │                                          │
         │                              Video.status = READY
         │                              Video.hlsUrl = /hls/:id/master.m3u8
         │
         ├── Upload imagem → Multer (10MB) → /uploads/images/:uuid
         ├── Upload PDF → Multer (50MB) → /uploads/pdfs/:uuid (auth obrigatória)
         ├── Upload Excel → Multer (10MB) → Cria alunos + matrícula automática
         │
         ▼
[Admin configura branding via Configurações]
         │
   PUT /api/admin/config → PlatformConfig → invalidateConfigCache()
         │
         ▼
[Qualquer usuário acessa a plataforma]
         │
   ConfigProvider → GET /api/config/public (cache 1min) → applyTheme()
         │
   Calcula CSS vars dinâmicas:
   ├── --primary, --primary-hover, --primary-glow
   ├── --primary-soft, --primary-light
   ├── --accent-pink, --accent-pink-glow
   └── document.title (nome da plataforma)
         │
         ▼
[Aluno acessa dashboard]
         │
   GET /api/student/my-courses → cursos matriculados + progresso % (batch único, sem N+1)
         │
   Dashboard exibe 2 seções:
   ├── "Continuar estudando" (cards grandes, último vídeo assistido)
   └── "Cursos em Andamento" (cards com barra de progresso)
         │
   Click no card → GET /api/student/lesson/:videoId
         │
   VideoPlayer.tsx → HLS.js carrega /hls/:id/master.m3u8
         │
         ├── POST /api/student/progress (a cada 10s)
         ├── Anotações (localStorage por videoId)
         └── Tab Downloads: PDF do módulo + Calendário do curso (com auth token)
```

## Editor de Blocos (BlockEditor)

```
AdminDashboard → Editar conteúdo da aula → Modal fullscreen
         │
         ▼
   BlockEditor.tsx (@dnd-kit drag-and-drop)
         │
   Tipos de bloco:
   ├── text   → ReactQuill (25 fontes Google, formatação completa)
   ├── image  → Upload de imagem com caption
   └── callout → Bloco de destaque (info, warning, success, error)
         │
   Cada bloco tem:
   ├── Cor de fundo configurável (16 presets + custom color picker)
   ├── Drag handle para reordenar
   └── Botão deletar
         │
   Salva como JSON no campo Video.content
         │
   LessonPage.tsx → BlockRenderer (renderiza blocos com fontes e cores)
```

## Material Didático (PDFs + Calendário)

```
Admin → Módulo → Upload PDF (material do professor, até 50MB)
   │
   └── Module.pdfUrl = /uploads/pdfs/:uuid.pdf

Admin → Curso → Upload PDF (calendário de aulas)
   │
   └── Course.calendarUrl = /uploads/pdfs/:uuid.pdf

Aluno → Lesson Page → Tab "Downloads"
   │
   ├── "Material do Módulo" → /uploads/pdfs/:file?token=JWT
   └── "Calendário de Aulas" → /uploads/pdfs/:file?token=JWT
```

## Sistema de Branding Dinâmico

```
PlatformConfig (PostgreSQL)
│
├── platformName  → Nome exibido no login, header do aluno, título da aba
├── primaryColor  → Cor base do tema (botões, gradientes, glows, badges)
├── accentColor   → Cor de destaque (gradientes secundários, badges premium)
└── logoUrl       → Logo exibido no login, header do dashboard, header da aula
         │
   ConfigContext.tsx (React Context)
         │
   applyTheme() → converte hex para RGB
         │         calcula variações (darken, lighten, alpha)
         │         seta CSS custom properties no :root
         │
   Backend: cache em memória (1 min) com invalidação no PUT
```

## Importação de Alunos via Excel

```
Admin → Upload .xlsx/.xls
         │
   Cabeçários: aluno (nome), matricula, turma (curso), cpf
         │
   Para cada linha:
   ├── Gera email: primeirosegundo@alunos.com
   ├── Gera senha: ano + 3 letras nome + 4 dígitos CPF
   ├── Cria usuário (ou encontra existente)
   └── Matricula no curso (match por nome da turma)
         │
   Retorna: tabela de credenciais para o admin distribuir
```

## Fórum de Comentários por Aula

```
Aluno → LessonPage → LessonComments.tsx
         │
   GET /api/student/comments/:videoId (polling 5s)
         │
   POST /api/student/comments { text, parentId? }
         │
   ├── Verifica ban ativo (ForumBan.active + expiresAt)
   ├── Verifica commentsEnabled no Video
   ├── Filtro de Profanidade (profanityFilter.ts)
   │     ├── ~50 regex patterns (palavrões, xingamentos, preconceito)
   │     ├── 3 severidades: LIGHT, MEDIUM, SEVERE
   │     └── Retorna { flagged, severity, word } ou null
   │
   ├── Se flagged:
   │     ├── Cria ForumViolation (registra word, severity, autoAction)
   │     ├── Conta violações do aluno
   │     ├── Aplica punição automática (se forumPunishmentEnabled):
   │     │     ├── LIGHT 3ª ofensa → ban 1 dia
   │     │     ├── MEDIUM → ban 2 dias imediato
   │     │     ├── SEVERE → ban 10 dias + "encaminhar ao comitê"
   │     │     └── 5ª+ ofensa (qualquer) → ban permanente
   │     └── Retorna 403 com detalhes da violação
   │
   └── Se limpo: cria LessonComment normalmente
```

## Sistema de Moderação e Punições (Admin)

```
Admin → AdminDashboard → Tab "Moderação"
         │
   GET /api/admin/comments/flagged?page=&limit=
         │
   Para cada comentário flagrado:
   ├── DELETE /api/admin/comments/:id  → remove
   └── PUT /api/admin/comments/:id/approve → desflagra

Admin → AdminDashboard → Tab "Punições"
         │
   ├── GET /api/admin/violations  → lista violações
   ├── GET /api/admin/bans        → lista bans (ativos/expirados)
   ├── POST /api/admin/bans       → ban manual (userId, reason, banType)
   ├── PUT /api/admin/bans/:id/lift → revoga ban
   ├── GET /api/admin/appeals     → lista recursos (filtro por status)
   ├── PUT /api/admin/appeals/:id → aprova/rejeita recurso
   └── PUT /api/admin/punishment-toggle → ativa/desativa punições automáticas

Aluno → LessonComments.tsx → Banner de Ban
         │
   GET /api/student/forum/my-status → violações + ban + recursos
         │
   POST /api/student/forum/appeal { reason } → envia recurso
```

## Sistema de Presença Automática

```
Aluno → LessonPage → VideoPlayer.tsx
         │
   Enquanto vídeo está em play:
   setInterval(30s) → POST /api/student/attendance/heartbeat { moduleId }
         │
   Backend (student.ts):
   ├── Verifica attendanceEnabled na PlatformConfig
   ├── Verifica matrícula ativa no curso do módulo
   ├── Calcula data de hoje (zerado horas/minutos)
   ├── Upsert Attendance (userId + moduleId + date)
   │     └── Incrementa watchTimeSeconds += 30
   ├── Se watchTimeSeconds >= attendanceMinMinutes * 60:
   │     └── status = PRESENT (autoDetected = true)
   └── Retorna { tracked, watchTimeSeconds, status, threshold }

Admin → AdminDashboard → Tab "Presença"
         │
   ├── Configuração:
   │     ├── attendanceEnabled (toggle on/off)
   │     ├── attendanceMinMinutes (tempo mínimo, default 20min)
   │     └── attendanceMode (DATE_ONLY = só no dia / FREE = qualquer dia)
   │
   ├── Consulta: GET /api/admin/attendance?moduleId=&date=
   │     └── Retorna lista completa (presentes + ausentes via enrollment)
   │
   ├── Edição: PUT /api/admin/attendance/:id
   │     ├── Exige justificativa (texto obrigatório)
   │     ├── Cria AttendanceEdit (audit trail)
   │     └── Registra quem editou (editedByUserId)
   │
   └── Criação Manual: POST /api/admin/attendance
         ├── Para alunos sem registro no dia
         └── Exige justificativa + audit trail
```

## Camadas de Segurança

| Camada | Implementação | Arquivo |
|--------|--------------|---------|
| **Headers HTTP** | Helmet (oculta stack, previne XSS/clickjacking, CORP cross-origin) | `server.ts` |
| **Rate Limiting** | 10 login/15min, 1000 API/15min, 300 progress/15min por IP | `server.ts` |
| **CORS** | Apenas `FRONTEND_URL` autorizado | `server.ts` |
| **JWT_SECRET** | Validação obrigatória na inicialização (process.exit se ausente) | `server.ts` |
| **Autenticação** | JWT 24h (login) / 5min (streaming) | `authMiddleware.ts` |
| **Autorização** | `requireRole(['ADMIN'])` em rotas restritas | `authMiddleware.ts` |
| **Enrollment** | Aluno só vê cursos com matrícula ativa (sem auto-matrícula) | `student.ts` |
| **Senha Forte** | bcrypt 12 rounds, mín. 8 chars + maiúsc. + minúsc. + número | `auth.ts`, `admin.ts` |
| **Upload Vídeo** | Filtro mimetype video/* + limite 500MB | `uploadMiddleware.ts` |
| **Upload Imagem** | Filtro mimetype image/* + limite 10MB | `admin.ts` |
| **Upload PDF** | Filtro mimetype application/pdf + limite 50MB + auth obrigatória | `admin.ts`, `server.ts` |
| **HLS Streaming** | Vídeo fatiado em segmentos .ts, UUID no path | `server.ts` |
| **Anti-Download** | Sem mp4 direto, right-click bloqueado, F12 bloqueado | `VideoPlayer.tsx` |
| **Watermark** | Nome + e-mail do aluno flutuando no vídeo | `VideoPlayer.tsx` |
| **XSS Content** | DOMPurify sanitiza HTML legado do material | `LessonPage.tsx` |
| **Graceful Shutdown** | SIGTERM/SIGINT → pg-boss graceful stop + Prisma disconnect | `server.ts` |
| **FFmpeg Timeout** | 30 minutos por qualidade, kill automático | `videoProcessor.ts` |
| **Pino Logging** | JSON estruturado + pino-http (substitui console.log) | `logger.ts`, `server.ts` |
| **Async File System** | Todas as operações de disco via fs/promises + Promise.all | `admin.ts` |
| **Filtro Profanidade** | ~50 regex patterns com 3 severidades (LIGHT/MEDIUM/SEVERE), bloqueia post e registra violação | `profanityFilter.ts` |
| **Ban Automático Fórum** | LIGHT 3ª→1d, MEDIUM→2d, SEVERE→10d+comitê, 5ª+→permanente; admin pode revogar | `student.ts`, `admin.ts` |
| **Presença Auditada** | Edições de presença exigem justificativa + audit trail (AttendanceEdit) com quem editou e quando | `admin.ts` |

## Infraestrutura de Produção (10k+ alunos)

| Componente | Arquivo | Descrição |
|------------|---------|----------|
| **PM2 Cluster** | `ecosystem.config.js` | N instâncias por core (cluster) + 1 worker fork (pg-boss/FFmpeg) |
| **Nginx Reverse Proxy** | `nginx.conf` | SSL, gzip, HLS/imagens direto do disco, proxy API, frontend SPA |
| **PostgreSQL Tuning** | `deploy/postgresql.conf` | shared_buffers 1GB, SSD otimizado, slow query log (>500ms) |
| **Deploy Guide** | `DEPLOY.md` | Passo a passo: servidor, DB, PM2, Nginx, SSL, backup, monitoramento |
| **Health Check** | `server.ts` GET `/` | Verifica DB (latência), disco (espaço livre), fila de vídeos. Status: healthy/degraded/unhealthy |
| **Métricas** | `server.ts` GET `/api/metrics` | Uptime, RSS, heap, PID, fila pendente |
| **Testes** | `core.test.ts` | 18 testes Vitest (credenciais, headers, senha, cache, roles) |

## Schema do Banco de Dados

```
User ──┬── CourseEnrollment ──── Course ──── Module ──── Video
       │     (@@unique          (calendarUrl)  (pdfUrl    (content JSON blocos)
       │      userId+courseId)                  @@index    @@index moduleId)
       │                                       courseId)       │
       ├── VideoHistory ───────────────────────────────────┘
       │      (@@unique userId+videoId)
       │
       ├── Attendance ─── AttendanceEdit
       │      (@@unique userId+moduleId+date)   (justification, editedBy)
       │
       ├── LessonComment ─── CommentReport
       │      (replies auto-ref, flagged, videoId)
       │
       ├── ForumViolation   (word, severity: LIGHT/MEDIUM/SEVERE, autoAction)
       ├── ForumBan         (banType: TEMP_1D/2D/10D/PERMANENT, active, expiresAt)
       └── ForumAppeal      (reason, status: PENDING/APPROVED/REJECTED, adminNote)

PlatformConfig (singleton — branding global + flags do fórum + presença)
```

### Campos-chave por modelo:
- `User`: id, username?, email, password, name, role (ADMIN/TEACHER/STUDENT)
- `Course`: id, name, description, thumbnailUrl, **calendarUrl**
- `CourseEnrollment`: userId, courseId (@@unique)
- `Module`: id, name, **pdfUrl**, courseId (@@index), order
- `Video`: id, title, description, **content** (JSON blocos ou HTML legado), thumbnailUrl, hlsUrl, status, moduleId (@@index), order, **commentsEnabled**
- `VideoHistory`: userId, videoId (@@unique), progress, completed
- `PlatformConfig`: platformName, primaryColor, accentColor, logoUrl, bannerUrl, namePart1/2, nameColor1/2, **forumPunishmentEnabled**, **attendanceEnabled**, **attendanceMinMinutes**, **attendanceMode**
- `AuditLog`: userId, action, target, details, createdAt
- `Notification`: userId, title, message, read, createdAt
- `LiveClass`: id, courseId, moduleId?, title, description?, startAt, endAt?, zoomJoinUrl, zoomStartUrl?, zoomMeetingId?, status (SCHEDULED/LIVE/ENDED/RECORDED), recordingVideoId?
- `LessonComment`: id, text, flagged, userId, videoId, parentId? (self-relation), replies[], reports[]
- `CommentReport`: id, commentId, userId, reason (@@unique commentId+userId)
- `ForumViolation`: id, userId, word, severity (enum LIGHT/MEDIUM/SEVERE), message, autoAction, createdAt
- `ForumBan`: id, userId, reason, banType (TEMP_1D/TEMP_2D/TEMP_10D/PERMANENT), expiresAt?, active, liftedBy?, liftedAt?, createdAt
- `ForumAppeal`: id, userId, reason, status (PENDING/APPROVED/REJECTED), adminNote?, createdAt, updatedAt
- `Attendance`: id, userId, moduleId, date, status (PRESENT/ABSENT), watchTimeSeconds, autoDetected (@@unique userId+moduleId+date, @@index userId/moduleId/date/status)
- `AttendanceEdit`: id, attendanceId, editedByUserId, oldStatus, newStatus, justification, createdAt

## Endpoints da API

### Auth (`/api/auth`)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/login` | Login com username/email + senha |
| GET | `/me` | Perfil do usuário logado |
| PUT | `/profile` | Atualiza username e/ou senha (exige senha atual, mín. 8 chars) |
| GET | `/stream-token` | Token HLS curta duração (5min) |

### Config (`/api/config`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/public` | Branding público + flags (fórum, presença) sem auth (cache 1min) |

### Admin (`/api/admin`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users?page=&limit=&search=` | Lista usuários (paginado + busca por nome/email) |
| POST | `/users` | Cria usuário (senha forte obrigatória) |
| PUT | `/users/:id` | Edita usuário (role, name, email, password) |
| DELETE | `/users/:id` | Deleta usuário (guard anti self-delete) |
| GET | `/courses?page=&limit=` | Lista cursos paginados com módulos + vídeos + enrollments |
| POST | `/courses` | Cria curso |
| PUT | `/courses/:id` | Edita curso (name, description, thumbnailUrl, **calendarUrl**) |
| DELETE | `/courses/:id` | Deleta curso (cascade + disk cleanup) |
| POST | `/modules` | Cria módulo |
| PUT | `/modules/:id` | Edita módulo (name, order, **pdfUrl**) |
| DELETE | `/modules/:id` | Deleta módulo (cascade + disk cleanup) |
| POST | `/enrollments` | Matricula aluno em curso |
| POST | `/enrollments/all` | Matricula TODOS os alunos em um curso |
| DELETE | `/enrollments/:id` | Remove matrícula |
| GET | `/videos?page=&limit=` | Lista vídeos paginados com status |
| PUT | `/videos/:id` | Edita vídeo (title, description, content, thumbnailUrl) |
| DELETE | `/videos/:id` | Deleta vídeo (disk cleanup) |
| POST | `/videos/:id/reprocess` | Reenfileira vídeo com erro |
| POST | `/upload-image` | Upload de imagem (thumbnails/logo/conteúdo) |
| POST | `/upload-pdf` | Upload de PDF (material de módulo/calendário) |
| POST | `/upload-students-excel` | Importação de alunos via .xlsx/.xls |
| GET | `/config` | Busca config global (auth ADMIN) |
| PUT | `/config` | Atualiza config global + invalida cache público |
| GET | `/stats` | Dashboard stats (7 contagens paralelas) |
| GET | `/export-students` | Exporta alunos em Excel (.xlsx) |
| GET | `/audit-log?page=&limit=` | Histórico de ações administrativas paginado |
| GET | `/reports` | Relatórios de progresso por aluno × curso |
| PUT | `/courses/reorder` | Reordena cursos por drag-and-drop |
| POST | `/notifications` | Envio de notificação broadcast para alunos |
| GET | `/live-classes` | Lista todas as aulas ao vivo |
| POST | `/live-classes` | Cria aula ao vivo (Zoom) |
| PUT | `/live-classes/:id` | Atualiza aula ao vivo (status, dados) |
| DELETE | `/live-classes/:id` | Remove aula ao vivo |
| POST | `/live-classes/:id/attach-recording` | Vincula gravação (vídeo) à aula ao vivo |
| GET | `/comments/flagged?page=&limit=` | Lista comentários flagrados (moderação) |
| DELETE | `/comments/:id` | Remove comentário flagrado |
| PUT | `/comments/:id/approve` | Aprova comentário flagrado |
| PUT | `/videos/:id/comments-toggle` | Ativa/desativa comentários de uma aula |
| PUT | `/punishment-toggle` | Ativa/desativa o sistema de punições automáticas |
| GET | `/violations` | Lista todas as violações de profanidade |
| GET | `/bans` | Lista todos os bans do fórum |
| PUT | `/bans/:id/lift` | Revoga ban manualmente |
| POST | `/bans` | Aplica ban manual (TEMP_1D/2D/10D/PERMANENT) |
| GET | `/appeals?status=` | Lista recursos dos alunos (PENDING/APPROVED/REJECTED) |
| PUT | `/appeals/:id` | Aprova ou rejeita recurso do aluno |
| GET | `/attendance` | Lista presença por módulo/data (inclui ausentes via enrollment) |
| PUT | `/attendance/:id` | Edita presença com justificativa obrigatória + audit trail |
| POST | `/attendance` | Cria presença manual com justificativa + audit trail |

### Student (`/api/student`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/my-courses` | Cursos matriculados + progresso (batch otimizado) |
| GET | `/lesson/:videoId` | Aula individual com pdfUrl + calendarUrl (valida enrollment) |
| POST | `/progress` | Salva progresso de vídeo |
| GET | `/progress/:videoId` | Busca progresso salvo |
| GET | `/certificate/:courseId` | Gera certificado de conclusão |
| GET | `/notifications` | Lista notificações do aluno |
| PUT | `/notifications/read-all` | Marca todas como lidas |
| PUT | `/notifications/:id/read` | Marca uma notificação como lida |
| GET | `/live-classes/:courseId` | Lista aulas ao vivo de um curso (valida matrícula) |
| GET | `/my-live-classes` | Lista aulas ao vivo de todos os cursos matriculados |
| GET | `/comments/:videoId` | Lista comentários de uma aula (com respostas aninhadas, status de ban) |
| POST | `/comments` | Cria comentário (filtro profanidade + punição automática) |
| DELETE | `/comments/:id` | Deleta próprio comentário |
| POST | `/comments/:id/report` | Denuncia comentário |
| GET | `/forum/my-status` | Violações, ban ativo e recursos do aluno |
| POST | `/forum/appeal` | Envia recurso contra punição |
| POST | `/attendance/heartbeat` | Heartbeat de presença (a cada 30s enquanto vídeo toca) |

### Video (`/api/video`)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/upload` | Upload de vídeo (Multer + pg-boss) |
| GET | `/module/:moduleId` | Lista vídeos de um módulo |

## Otimizações de Performance (10k+ alunos)

| Otimização | Detalhe |
|------------|---------|
| **N+1 eliminado** | `/my-courses` faz 1 query batch de VideoHistory + Map para lookup O(1) |
| **Paginação** | GET /users, /courses, /videos retornam `{ data, total, page, totalPages }` |
| **Busca server-side** | GET /users aceita `?search=` com `contains` insensitive |
| **Índices de FK** | `@@index([courseId])` em Module, `@@index([moduleId])` em Video |
| **Connection Pool** | `connection_limit=20` na DATABASE_URL |
| **Cache de Config** | Branding público em memória (1min TTL) com invalidação no PUT |
| **Stats paralelos** | 7 contagens em Promise.all simultâneo |
| **Graceful Shutdown** | SIGTERM/SIGINT → pg-boss graceful stop + Prisma disconnect |
| **HLS Immutable Cache** | Segmentos `.ts` com `max-age=1y, immutable`; `.m3u8` com `no-cache` |
| **Async fs** | Todas as operações de disco via `fs/promises` + `Promise.all` para deleções paralelas |
| **Parallel Lesson** | `/lesson/:videoId` — enrollment + modules em `Promise.all` |
| **Excel Batch** | `createMany` com `skipDuplicates` + Maps pré-carregados (3 queries, não N) |
| **Select Minimal** | `/my-courses` usa `select` em vez de `include` (reduz payload ~60%) |
| **PM2 Cluster** | N instâncias HTTP por core + 1 worker dedicado (FFmpeg/pg-boss) |
| **Nginx Static** | HLS/imagens servidos direto pelo Nginx (~70% menos carga no Node) |

## Ops & Observabilidade

| Componente | Detalhe |
|------------|---------|
| **Uptime Kuma** | Docker self-hosted — monitora health check, API, HLS, SSL, PostgreSQL. Alertas Telegram/Discord |
| **Rate Limiting Nginx** | 4 zonas: geral (30r/s), login (5r/m anti brute-force), upload (3r/m), API write (15r/s) |
| **CloudFlare Free** | DDoS protection, CDN 300+ PoPs, SSL Full (Strict), WAF básico, Bot Fight Mode |
| **k6 Load Tests** | 4 cenários: smoke (5 VUs), load (100 VUs), stress (300 VUs), spike (500 VUs) com SLA thresholds |
| **Runbook** | 9 cenários de incidente (inclui DDoS) com diagnóstico + ações ordenadas + backup/restauração + checklist pós-mortem |
| **CloudFlare Real IP** | Nginx `set_real_ip_from` com auto-update via cron (script busca IPs oficiais semanalmente) |
| **PM2 Log Rotation** | pm2-logrotate: 100MB max, 30 dias retenção, compressão. max_memory_restart: 1G (previne memory leak) |
| **Backup Test** | Script `test-backup-restore.sh` valida backup semanalmente (restore + integridade referencial) |
| **Rollback Strategy** | Tags `pre-deploy-*` + procedimentos de rollback de código e migrações Prisma |

## Convenções para Manutenção

- **Rotas backend** seguem o padrão RESTful com paginação via query params
- **Cada arquivo de rota** tem separadores visuais (`// ====`) agrupando endpoints por entidade
- **Prisma** é o ORM único — modificar `schema.prisma` e rodar `npx prisma db push`
- **CSS** é puro vanilla — todas as variáveis estão em `:root` no `index.css`
- **CSS Variables dinâmicas** — `ConfigContext.tsx` sobrescreve vars em runtime
- **CSS Namespacing** — Student Dashboard: `sd-*`, Lesson Page: `lp-*`, Admin: `admin-*`, Fórum: `lc-*`, Presença: `att-*`
- **Conteúdo de aula** — JSON de blocos (novo) ou HTML sanitizado (legado), ambos suportados
- **Fontes** — 25 fontes Google Fonts registradas no Quill e renderizadas no BlockRenderer
- **PDFs** — servidos em `/uploads/pdfs` com auth middleware (token via query param)
- **Imagens** — servidas em `/uploads/images` sem auth (Helmet CORP cross-origin)
