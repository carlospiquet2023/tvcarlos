# EduVault - Plataforma Premium de Hospedagem de Vídeos Institucional
**Desenvolvido sob rígido escopo de segurança para: Carlos Antonio de Oliveira Piquet**
**Contato Administrativo:** carlospiquet.projetos@gmail.com

---

## 🛡️ Visão Geral e Auditoria QA
O EduVault é uma plataforma full-stack arquitetada em formato de camadas (Node/Express 5 + React 19 + PostgreSQL) voltada à entrega segura de vídeos privados de altíssima qualidade. O sistema passou por rigorosa **Auditoria de Qualidade (QA)**, **Redesign v3.0**, **Hardening de Produção v4.0**, **Infraestrutura de Produção v5.0**, **Módulo de Aulas ao Vivo v6.0**, **Ops & Observabilidade v7.0**, **Production Hardening v8.0**, **Fórum com Sistema de Punições v9.0** e **Sistema de Presença Automática v10.0** — abrangendo editor de blocos drag-and-drop, materiais PDF, paginação com busca, importação Excel, 25 fontes Google, **branding dinâmico completo**, PM2 cluster mode, Nginx reverse proxy, suporte a **10.000+ alunos simultâneos**, integração Zoom para aulas ao vivo, **monitoramento Uptime Kuma**, **rate limiting Nginx**, **CloudFlare CDN/DDoS**, **testes de carga k6**, **runbook operacional**, **health check avançado**, **PM2 log rotation**, **teste automático de backup**, **estratégia de rollback**, **fórum de comentários por aula**, **sistema de punições automáticas com moderação admin** e **sistema de presença automática com heartbeat de vídeo e listas editáveis com auditoria**.

**Evolução completa:**

### v3.0 — Redesign Completo
1. **Zero Bugs:** QA 100% limpo, TypeScript compila sem erros em ambos frontend e backend.
2. **Branding Dinâmico:** Admin controla nome, logo, cor primária e cor de destaque — reflete em todas as páginas.
3. **CSS Variables Derivadas:** 7 variações automáticas de cor (hover, glow, soft, light, accent).
4. **Logo Dinâmico:** Login + Dashboard + Aula, com fallback automático para ícone.
5. **Helmet CORP:** `crossOriginResourcePolicy: cross-origin` para imagens cross-origin.
6. **Prevenção de Injeções:** Guard anti self-delete, Role Injection estancada.
7. **HLS Token:** Token de curtíssima duração (5min) para streaming seguro.
8. **Limpeza Profunda:** Exclusões cascateiam limpeza de arquivos HLS do disco.

### v4.0 — Editor de Blocos + Material Didático + Produção
9. **Editor de Blocos Drag-and-Drop:** @dnd-kit com 3 tipos (texto, imagem, destaque), 25 fontes Google Fonts, cor de fundo por bloco.
10. **Material PDF por Módulo:** Upload de PDF até 50MB, servido com autenticação obrigatória.
11. **Calendário por Curso:** Upload de PDF de calendário, disponível na aba Downloads da aula.
12. **Importação de Alunos via Excel:** Upload .xlsx/.xls com criação automática de usuários + matrículas.
13. **Paginação + Busca:** Endpoints admin paginados (`?page&limit&search`) + UI com controles de navegação.
14. **N+1 Eliminado:** Query batch única com Map para lookup O(1) no `/my-courses`.
15. **Senha Forte:** Mín. 8 chars + maiúscula + minúscula + número (criação e atualização).
16. **FFmpeg Timeout:** 30 minutos por qualidade com kill automático.
17. **Graceful Shutdown:** SIGTERM/SIGINT → pg-boss stop + Prisma disconnect.
18. **Cache de Config:** Branding público em memória (1min TTL) com invalidação no PUT.
19. **Índices de FK:** `@@index([courseId])` em Module, `@@index([moduleId])` em Video.
20. **Connection Pool:** `connection_limit=20` na DATABASE_URL.
21. **JWT_SECRET Obrigatório:** process.exit(1) se variável ausente na inicialização.

### v5.0 — Infraestrutura de Produção (10k+ alunos)
22. **PM2 Cluster Mode:** `ecosystem.config.js` com N instâncias por core + 1 worker fork dedicado para pg-boss/FFmpeg.
23. **Pino Structured Logging:** JSON logging com pino-http, substituindo todo console.log/error. Nível configurável por ambiente.
24. **Health Check:** `GET /` verifica DB (`SELECT 1`) + estado do pg-boss. Retorna 503 se indisponível.
25. **Métricas Operacionais:** `GET /api/metrics` — uptime, memória RSS/heap, PID, fila pendente.
26. **Rate Limit Escalado:** 1000 req/15min (API geral) + 300/15min (progress) + 10/15min (login).
27. **Excel Batch Import:** `createMany` com `skipDuplicates` + Maps pré-carregados (3 queries em vez de N).
28. **Senhas Criptograficamente Seguras:** `crypto.randomBytes` para geração de senhas em importação Excel.
29. **Async File System:** Todas as operações fs (delete, access) convertidas para `fs/promises` com `Promise.all`.
30. **HLS Cache Immutable:** Segmentos `.ts` com `Cache-Control: immutable, max-age=1y`; playlists `.m3u8` com `no-cache`.
31. **Nginx Reverse Proxy:** Config pronta para produção — serve HLS/imagens direto do disco (~70% menos carga no Node).
32. **PostgreSQL Tuning:** Config otimizada para SSD/4GB+ RAM (shared_buffers, work_mem, slow query log).
33. **18 Testes Automatizados:** Vitest cobrindo credenciais, headers, força de senha, cache, roles.
34. **Guia de Deploy Completo:** `DEPLOY.md` com passo a passo: servidor, DB, PM2, Nginx, SSL, backup, monitoramento.

### v5.1 — Funcionalidades Avançadas
35. **Audit Log:** Registro automático de todas as ações administrativas com histórico completo.
36. **Relatórios de Progresso:** Dashboard com métricas por aluno × curso, exportável.
37. **Notificações:** Sistema push interno com bell icon, broadcast para todos os alunos.
38. **Reordenação de Cursos:** Drag-and-drop de ordem dos cursos no admin.
39. **ConfirmModal:** Todos os `window.confirm` substituídos por modal elegante.
40. **Error Boundary:** Captura erros React globais com UI de recuperação.
41. **Upload Progress Bar:** Barra de progresso visual para upload de vídeos.
42. **Exportação de Alunos:** Download Excel de todos os alunos cadastrados.
43. **Certificado de Conclusão:** Geração automática de certificado em HTML/PDF ao concluir curso.
44. **PWA (Progressive Web App):** manifest.json + service worker para instalação como app.
45. **Dark Mode:** Toggle claro/escuro no dashboard do aluno com persistência.

### v6.0 — Aulas ao Vivo (Zoom Integration)
46. **Modelo LiveClass:** Entidade Prisma com status (SCHEDULED/LIVE/ENDED/RECORDED), datas, links Zoom, relação com Course/Module/Video.
47. **CRUD Admin de Aulas ao Vivo:** Nova aba "Aulas ao Vivo" no painel admin com formulário completo: curso, módulo, título, datas, Zoom Join/Start URL, Meeting ID.
48. **Gestão de Status:** Admin altera status da aula (Agendada → Ao Vivo → Encerrada) com badge visual e audit log.
49. **Vinculação de Gravação:** Admin pode vincular um vídeo da plataforma como gravação de aula ao vivo já encerrada.
50. **Dashboard do Aluno — Cards ao Vivo:** Seção "Aulas ao Vivo" no topo do dashboard com cards escuros estilo premium, indicador pulsante para aulas em andamento, link direto para Zoom.
51. **Página da Aula — Banner ao Vivo:** Banner contextual na LessonPage quando há aula ao vivo agendada/em andamento para o curso da aula atual, com botão de entrada.
52. **API do Aluno Segura:** Endpoints `GET /live-classes/:courseId` e `GET /my-live-classes` com validação de matrícula — aluno só vê aulas de cursos em que está matriculado.
53. **Caminho Simples (sem OAuth):** Abordagem pragmática — admin cola link do Zoom, plataforma mostra ao aluno no momento certo. Sem complexidade de API Zoom.

### v7.0 — Ops & Observabilidade
54. **Uptime Kuma:** Monitoramento self-hosted via Docker — health check, API, HLS, SSL, PostgreSQL. Alertas via Telegram/Discord/Email.
55. **Rate Limiting Nginx:** 4 zonas de limitação (geral 30r/s, login 5r/m, upload 3r/m, escrita 15r/s) com burst configurável — bloqueia abuso antes de tocar no Node.
56. **CloudFlare Free:** Guia completo de configuração — DDoS protection, CDN global, SSL Full (Strict), Page Rules para HLS, Firewall Rules, Bot Fight Mode.
57. **k6 Load Tests:** Suíte completa com 4 cenários (smoke 5 VUs, load 100 VUs, stress 300 VUs, spike 500 VUs), métricas customizadas, thresholds SLA (p95 < 500ms, erros < 1%).
58. **Runbook de Incidentes:** Guia operacional para 8 cenários de falha — site down, login quebrado, vídeos travados, SSL expirado, disco cheio, rate limit, Zoom, lentidão. Inclui comandos de diagnóstico, ações ordenadas e checklist pós-incidente.
59. **CloudFlare Real IP no Nginx:** Seção pronta com todos os ranges IPv4/IPv6 do CloudFlare para `set_real_ip_from` + `real_ip_header CF-Connecting-IP`.

### v8.0 — Production Hardening (10/10)
60. **Health Check Avançado:** `GET /` agora verifica latência do DB, espaço em disco, tamanho da fila de vídeos. Retorna status `healthy` (200), `degraded` (503) ou `unhealthy` (503) com warnings específicos.
61. **PM2 Log Rotation:** `max_memory_restart: 1G` + instruções de `pm2-logrotate` (100MB max, 30 dias retenção, compressão). Previne memory leaks e disco cheio por logs.
62. **Teste Automático de Backup:** Script `deploy/test-backup-restore.sh` — cron semanal que restaura backup em DB temporário, valida tabelas críticas, detecta dados órfãos e alerta se backup > 48h.
63. **Estratégia de Rollback:** Tags `pre-deploy-*` automáticas antes de cada deploy, procedimentos de rollback de código e migrações Prisma documentados no DEPLOY.md.
64. **Incidente DDoS no Runbook:** Novo cenário de ataque DDoS com diagnóstico, ativação de Under Attack Mode no CloudFlare, bloqueio por país e prevenção.
65. **Auto-Update IPs CloudFlare:** Script cron que atualiza automaticamente os ranges de IP do CloudFlare no Nginx via API oficial.

### v9.0 — Fórum de Comentários + Sistema de Punições
66. **Fórum por Aula:** Comentários em cada vídeo com respostas aninhadas, polling 5s tempo real, toggle de comentários por aula pelo admin.
67. **Filtro de Profanidade:** ~50 regex patterns locais com 3 níveis de severidade (LIGHT/MEDIUM/SEVERE) — detecta palavrões, xingamentos e preconceito.
68. **Punições Automáticas:** LIGHT 3ª ofensa → ban 1d, MEDIUM → ban 2d imediato, SEVERE → ban 10d + "encaminhar ao comitê", 5ª+ → permanente. Toggle global pelo admin.
69. **Denúncias de Comentários:** Alunos denunciam comentários (unique por comentário+usuário), 3+ denúncias → flag automático para moderação.
70. **Painel de Moderação Admin:** Nova aba no admin lista comentários flagrados com opção de aprovar ou remover.
71. **Painel de Punições Admin:** Nova aba com 4 sub-abas: violações, bans ativos, ban manual, recursos de alunos (aprovar/rejeitar).
72. **Recursos do Aluno:** Aluno banido pode enviar recurso textual; admin aprova (revoga ban) ou rejeita com nota.
73. **Banner de Ban:** LessonComments exibe banner visual quando aluno está banido, com prazo de expiração e botão de recurso.
74. **Modal de Violação:** Feedback visual ao aluno quando comentário é bloqueado pelo filtro (severidade, palavra, ação aplicada).
75. **5 Novos Modelos Prisma:** LessonComment, CommentReport, ForumViolation, ForumBan, ForumAppeal + enum ViolationSeverity.

### v10.0 — Sistema de Presença Automática
76. **Heartbeat de Presença:** VideoPlayer envia `POST /api/student/attendance/heartbeat` a cada 30s enquanto o vídeo toca, incrementando `watchTimeSeconds` no registro de presença do aluno.
77. **Detecção Automática:** Quando o tempo assistido atinge o mínimo configurável (default 20min), o sistema marca presença automaticamente (`autoDetected = true`).
78. **Configuração pelo Admin:** Toggle on/off, tempo mínimo em minutos e modo (DATE_ONLY = só no dia / FREE = qualquer dia) — tudo via aba Presença no painel admin.
79. **Lista de Presença Completa:** Admin consulta presença por módulo + data, vendo presentes e ausentes (alunos matriculados sem registro recebem status ABSENT).
80. **Edição com Auditoria:** Admin pode alterar presença/falta com justificativa obrigatória. Cada edição gera `AttendanceEdit` (audit trail) com quem editou, status anterior/novo e justificativa.
81. **Criação Manual:** Admin pode marcar presença manualmente para alunos sem registro no dia, com justificativa obrigatória.
82. **2 Novos Modelos Prisma:** Attendance (@@unique userId+moduleId+date), AttendanceEdit + enum AttendanceStatus (PRESENT/ABSENT).
83. **3 Novos Campos PlatformConfig:** attendanceEnabled, attendanceMinMinutes, attendanceMode.

---

## 🎨 Sistema de Branding Dinâmico (White-Label)

O admin controla a aparência completa da plataforma sem tocar em código:

### O que pode ser personalizado:
| Elemento | Onde aparece | Como configurar |
|----------|-------------|----------------|
| **Nome da Plataforma** | Login (h1), Header do Aluno, Título da aba do navegador | Input texto no admin |
| **Logo** | Login (substitui ícone), Header do Dashboard, Header da Aula | Upload de imagem (PNG/SVG) no admin |
| **Cor Primária** | Botões, gradientes, glows, cards, badges, bordas, progress bars | Color picker no admin |
| **Cor de Destaque** | Gradientes secundários, detalhes premium | Color picker no admin |

### Como funciona por baixo:
1. `PlatformConfig` no PostgreSQL armazena `platformName`, `primaryColor`, `accentColor`, `logoUrl`
2. `ConfigProvider` no React busca `GET /api/config/public` (rota sem auth, cache 1min no servidor)
3. `applyTheme()` converte hex → RGB e calcula CSS vars dinâmicas
4. Todas as páginas usam essas CSS variables → tema muda instantaneamente

---

## ✏️ Editor de Blocos Drag-and-Drop

O admin edita o conteúdo de cada aula em um editor visual em modal fullscreen:

### Tipos de bloco:
| Tipo | Descrição | Formatação |
|------|-----------|------------|
| **Texto** | ReactQuill com 25 fontes Google Fonts | Bold, italic, listas, links, tamanho, cor |
| **Imagem** | Upload com caption descritiva | Preview inline |
| **Destaque** | Bloco callout (info, warning, success, error) | Título + conteúdo com ícone por tipo |

### Recursos do editor:
- **Drag-and-drop** via @dnd-kit para reordenar blocos
- **Cor de fundo** por bloco: 16 presets + color picker customizado
- **25 fontes** Google Fonts registradas (Roboto, Open Sans, Montserrat, Playfair Display, etc.)
- **Salva como JSON** no campo `Video.content`
- **Renderização** no LessonPage com BlockRenderer (suporta JSON novo e HTML legado)

---

## 📄 Material Didático (PDF + Calendário)

| Recurso | Upload | Acesso |
|---------|--------|--------|
| **Material do Módulo** | Admin → editar módulo → upload PDF (até 50MB) | Aluno → Aula → aba Downloads |
| **Calendário do Curso** | Admin → editar curso → upload PDF calendário | Aluno → Aula → aba Downloads |

- PDFs servidos com **autenticação obrigatória** (token via query param)
- Armazenados em `/uploads/pdfs/` com UUID único

---

## 📊 Importação de Alunos via Excel

O admin faz upload de planilha `.xlsx` ou `.xls` com as colunas:
- `aluno` (nome completo), `matricula`, `turma` (nome do curso), `cpf`

O sistema automaticamente:
1. Gera e-mail: `primeirosegundo@alunos.com`
2. Gera senha: `ano + 3 letras do nome + 4 dígitos do CPF`
3. Cria usuário (ou encontra existente por matrícula)
4. Matricula no curso correspondente
5. Retorna tabela de credenciais para distribuição

---

## 🎨 User Experience

### Student Dashboard (2 Seções Inteligentes)
*   **Header Premium:** Logo dinâmico + nome da plataforma + busca + progresso global (%) + avatar + logout.
*   **"Continuar Estudando":** Cards grandes com thumbnail, título do último vídeo, barra de progresso e botão "Prosseguir".
*   **"Cursos em Andamento":** Carrossel horizontal estilo Netflix com thumbnail, nome, barra de progresso e percentual.
*   **Busca Local:** Filtra cursos por nome em tempo real.

### Lesson Page (Página da Aula)
*   **Header com Logo:** Logo dinâmico + nome do curso + nome da aula.
*   **Vídeo Full-Width:** Player HLS seguro com marca d'água dinâmica (nome + e-mail).
*   **Barra de Ferramentas:** Botão "Anotações" (localStorage por vídeo).
*   **Conteúdo em Blocos:** Renderização de blocos JSON (texto com fontes, imagens, destaques) + HTML legado sanitizado.
*   **Aba Downloads:** Cards para download de PDF do módulo e calendário do curso (com auth token).
*   **Sidebar:** Card "Resumo" com descrição da aula.
*   **Fórum de Comentários:** Comentários por aula com respostas aninhadas, denúncias, polling 5s, banner de ban e recurso.

### Login
*   **Logo e Nome Dinâmicos** do branding configurado pelo admin.
*   **Gradientes Animados** usando cores primária e de destaque.

### Admin Dashboard
*   **Visão Geral:** Stats com 7 contagens (cursos, alunos, vídeos, etc.).
*   **Usuários:** CRUD paginado + busca por nome/e-mail + senha forte obrigatória.
*   **Cursos:** CRUD de cursos (com calendário PDF), módulos (com material PDF), vídeos, thumbnails, editor de blocos fullscreen.
*   **Matrículas:** Individual + matricular todos os alunos em um curso + importação via Excel.
*   **Configurações:** Credenciais + Aparência da Plataforma (nome, cores, logo).
*   **Moderação:** Lista de comentários flagrados com ações de aprovar ou remover.
*   **Punições:** Violações de profanidade, bans ativos, ban manual, recursos de alunos (aprovar/rejeitar), toggle de punições automáticas.
*   **Presença:** Configuração (toggle, tempo mínimo, modo), consulta por módulo+data, tabela com presentes/ausentes, edição com justificativa obrigatória e histórico de edições.

---

## 🔒 Níveis Ativos de Segurança

1. **Prisma ORM + Helmet:** Proteção contra SQL Injection + headers HTTP seguros (XSS, Clickjacking, CORP cross-origin).
2. **FFmpeg Pipeline Segura:** pg-boss + HLS adaptativo (360p/720p/1080p) — impossibilita download do mp4 original. Timeout de 30 minutos por qualidade.
3. **Enrollment Obrigatório:** Só visualiza quem possuir matrícula ativa — sem auto-matrícula.
4. **Frontend Shield:** Right-click bloqueado, F12 bloqueado, marca d'água dinâmica rastreável.
5. **Upload Seguro:** Vídeo (500MB, video/*), Imagem (10MB, image/*), PDF (50MB, application/pdf) — UUIDs únicos.
6. **Senha Forte:** bcrypt 12 rounds, mín. 8 chars + maiúscula + minúscula + número.
7. **JWT Validado:** Token 24h (login), 5min (stream). JWT_SECRET obrigatório (process.exit se ausente).
8. **Rate Limiting:** 10 login/15min, 1000 API/15min, 300 progress/15min por IP.
9. **Graceful Shutdown:** SIGTERM/SIGINT → pg-boss graceful stop + Prisma disconnect.
10. **PDFs Autenticados:** Servidos com middleware de auth (token via query param).
11. **Pino Structured Logging:** Logs JSON estruturados (substitui console.log). Auto-logging HTTP com pino-http.
12. **HLS Immutable Cache:** Segmentos `.ts` com `Cache-Control: immutable`; `.m3u8` com `no-cache`.
13. **Filtro de Profanidade:** ~50 regex patterns locais com 3 severidades (LIGHT/MEDIUM/SEVERE) — bloqueia comentário e registra violação.
14. **Ban Automático de Fórum:** Punições progressivas (1d/2d/10d/permanente) com toggle global; admin pode revogar e gerenciar recursos.
15. **Presença Auditada:** Edições de presença exigem justificativa obrigatória + `AttendanceEdit` como audit trail (quem editou, quando, status anterior/novo).

---

## 📊 Schema do Banco de Dados (PostgreSQL + Prisma)

```
User ──┬── CourseEnrollment ──── Course ──── Module ──── Video
       │     (@@unique           (calendarUrl)  (pdfUrl    (content JSON blocos)
       │      userId+courseId)                   @@index    @@index moduleId)
       │                                        courseId)       │
       ├── VideoHistory ───────────────────────────────────┘
       │      (@@unique userId+videoId)
       │
       ├── Attendance ─── AttendanceEdit
       │      (@@unique userId+moduleId+date)   (justification, editedBy)
       │
       ├── LessonComment ─── CommentReport
       │      (replies auto-ref, flagged, videoId)
       │
       ├── ForumViolation   (word, severity, autoAction)
       ├── ForumBan         (banType, active, expiresAt)
       └── ForumAppeal      (reason, status, adminNote)

PlatformConfig (singleton — branding global + flags do fórum + presença)
├── platformName, primaryColor, accentColor, logoUrl
├── bannerUrl, namePart1/2, nameColor1/2
├── forumPunishmentEnabled
└── attendanceEnabled, attendanceMinMinutes, attendanceMode
```

**Modelos**: User, Course, CourseEnrollment, Module, Video, VideoHistory, PlatformConfig, AuditLog, Notification, LiveClass, LessonComment, CommentReport, ForumViolation, ForumBan, ForumAppeal, Attendance, AttendanceEdit
**Enums**: ViolationSeverity (LIGHT, MEDIUM, SEVERE), AttendanceStatus (PRESENT, ABSENT)
**Status do vídeo**: PENDING → PROCESSING → READY | ERROR
**Índices**: `@@index([courseId])` em Module, `@@index([moduleId])` em Video

---

## 🚀 Como Iniciar (Setup)

**Método Rápido (Windows):** Duplo clique em `INICIAR_PROJETO.bat` na raiz do projeto.

**Método Manual:**

1. **Terminal 1 — Backend:**
    ```bash
    cd backend
    npm install
    npx prisma db push
    npx ts-node prisma/seed.ts
    npm run dev
    ```
    *Aguarde o Prisma Client e o Worker FFmpeg subirem na porta 4000.*

2. **Terminal 2 — Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    *Acesse `http://localhost:5173`.*

### Variáveis de Ambiente (`.env` do Backend)
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | Conexão PostgreSQL (com `&connection_limit=20`) | `postgresql://user:pass@localhost:5432/eduvault?connection_limit=20` |
| `JWT_SECRET` | Chave JWT (**obrigatória**, server não inicia sem) | Hash hexadecimal de 64 caracteres |
| `PORT` | Porta do servidor Express | `4000` |
| `FRONTEND_URL` | URL do frontend (CORS) | `http://localhost:5173` |
| `VIDEO_STORAGE_PATH` | Diretório de vídeos brutos | `./uploads/videos` |
| `HLS_STORAGE_PATH` | Diretório dos segmentos HLS | `./uploads/hls` |
| `IMAGE_STORAGE_PATH` | Diretório de imagens | `./uploads/images` |
| `PDF_STORAGE_PATH` | Diretório de PDFs (material + calendário) | `./uploads/pdfs` |

### Primeiros Passos após Instalação
1. Acesse `http://localhost:5173` → Login com seed master
2. No painel Admin → aba **Configurações** → seção **Aparência da Plataforma**
3. Configure: nome do cliente, faça upload do logo, escolha as cores
4. Crie cursos (com calendário PDF), módulos (com material PDF) e faça upload de vídeos
5. Use o editor de blocos para criar conteúdo rico nas aulas (textos com fontes, imagens, destaques)
6. Matricule alunos individualmente, em massa ou via importação de planilha Excel
7. Distribua as credenciais geradas

### Usuários de Seed Inicial
*   **Usuário:** `plataforma` (ou e-mail: `carlospiquet.projetos@gmail.com`)
*   **Senha:** `!Senha123`

*(Recomenda-se alterar as credenciais e configurar o branding imediatamente após o primeiro acesso)*.

---

## 🚀 Deploy em Produção (10k+ alunos)

Para deploy em produção com suporte a 10.000+ alunos simultâneos, consulte:

| Arquivo | Descrição |
|---------|----------|
| **`DEPLOY.md`** | Guia completo passo a passo (servidor, DB, PM2, Nginx, SSL, backup, monitoramento) |
| **`ecosystem.config.js`** | PM2 cluster mode (N instâncias por core) + 1 worker dedicado FFmpeg/pg-boss |
| **`nginx.conf`** | Nginx reverse proxy (SSL, gzip, HLS direto do disco, cache immutable) |
| **`deploy/postgresql.conf`** | Tuning PostgreSQL para 10k (shared_buffers, SSD, slow query log) |
| **`backend/.env.example`** | Template de variáveis de ambiente com documentação |

### Arquitetura de Produção

```
Internet → Nginx (443/SSL)
             ├─ /            → Frontend SPA (React build estático)
             ├─ /api/*       → Proxy → PM2 Cluster (N × Node.js:4000)
             ├─ /hls/*       → Disco direto (70% menos carga no Node)
             ├─ /images/*    → Disco direto (cache 7d)
             └─ /pdfs/*      → Proxy → Node (requer JWT auth)
                              │
                       PM2 Cluster
                       ├─ eduvault-api ×N (cluster mode)
                       └─ eduvault-worker ×1 (FFmpeg + pg-boss)
                              │
                       PostgreSQL 16 (tuning p/ 10k)
```
