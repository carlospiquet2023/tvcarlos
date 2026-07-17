# EduVault - Plataforma Premium de Hospedagem de Vídeos Institucional

> Governança do projeto: consulte a [auditoria técnica](docs/TECHNICAL_AUDIT.md), os [gates de produção](docs/PRODUCTION_READINESS.md), a [evidência da release atual](docs/RELEASE_READINESS_2026-07-16.md), a [estratégia de produto](docs/PRODUCT_AND_PROCUREMENT_STRATEGY.md), a [matriz de evidências](docs/PROCUREMENT_EVIDENCE_MATRIX.md), a [governança LGPD](docs/LGPD_AND_DATA_GOVERNANCE.md), a [governança de IA](docs/AI_GOVERNANCE.md) e os [SLOs](docs/SLO.md).

Validação local completa: `npm run install:all` e `npm run quality` na raiz.
**Desenvolvido sob rígido escopo de segurança para: Carlos Antonio de Oliveira Piquet**
**Contato Administrativo:** carlospiquet.projetos@gmail.com

---

## 🛡️ Visão geral

O EduVault é uma plataforma full-stack em monólito modular (Node/Express 5, React 19 e PostgreSQL) que reúne LMS, operação escolar, vídeo, IA e broadcast. A topologia, os limites dos módulos e as condições de escala estão documentados em `ARCHITECTURE.md` e `UNIFIED_PLATFORM.md`.

Capacidade não é declarada apenas com base em configuração. Qualquer meta de simultaneidade exige SLO, perfil de uso, ambiente dimensionado e relatório de carga reproduzível.

## Capacidades atuais

- autenticação institucional, revogação de sessões e troca obrigatória de senha temporária;
- catálogo de cursos, módulos, aulas, materiais, progresso, quizzes e certificados;
- editor de conteúdo em blocos e streaming HLS protegido;
- importação e exportação de estudantes por Excel;
- operação escolar multi-instituição com campus, ano, turma, diário, avaliações e responsáveis;
- aulas ao vivo com links de provedores externos;
- professor de IA com contexto autorizado e histórico por aluno;
- Campus ao Vivo, programação, ticker, parceiros e autorização RTMP;
- auditoria administrativa, métricas protegidas, health checks e graceful shutdown;
- API e worker FFmpeg separados em produção;
- migrations versionadas e constraints multi-tenant no PostgreSQL;
- CI com lint, testes, build, auditoria, validação Prisma e migration em banco vazio.

Os controles implementados e as lacunas operacionais são acompanhados em docs/PRODUCTION_READINESS.md. O histórico Git é a fonte para evolução por versão; este README descreve apenas o estado atual.

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

### Login
*   **Logo e Nome Dinâmicos** do branding configurado pelo admin.
*   **Gradientes Animados** usando cores primária e de destaque.

### Admin Dashboard
*   **Visão Geral:** Stats com 7 contagens (cursos, alunos, vídeos, etc.).
*   **Usuários:** CRUD paginado + busca por nome/e-mail + senha forte obrigatória.
*   **Cursos:** CRUD de cursos (com calendário PDF), módulos (com material PDF), vídeos, thumbnails, editor de blocos fullscreen.
*   **Matrículas:** Individual + matricular todos os alunos em um curso + importação via Excel.
*   **Configurações:** Credenciais + Aparência da Plataforma (nome, cores, logo).

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

---

## 📊 Schema do Banco de Dados (PostgreSQL + Prisma)

```
User ──┬── CourseEnrollment ──── Course ──── Module ──── Video
       │     (@@unique           (calendarUrl)  (pdfUrl    (content JSON blocos)
       │      userId+courseId)                   @@index    @@index moduleId)
       │                                        courseId)
       └── VideoHistory ───────────────────────────────────┘
              (@@unique userId+videoId)

PlatformConfig (singleton — branding global)
├── platformName  (default: "EduVault")
├── primaryColor  (default: "#6366f1")
├── accentColor   (default: "#ec4899")
└── logoUrl       (opcional)
```

**Modelos**: User, Course, CourseEnrollment, Module, Video, VideoHistory, PlatformConfig
**Status do vídeo**: PENDING → PROCESSING → READY | ERROR
**Índices**: `@@index([courseId])` em Module, `@@index([moduleId])` em Video

---

## 🚀 Como Iniciar (Setup)

### Modo Profissional (Docker - recomendado)

Pré-requisito único: Docker Desktop (Windows) ou Docker Engine + Compose (Linux).

Copie `.env.example` para `.env` na raiz e personalize segredos/SMTP.

```bash
cp .env.example .env
docker compose up -d --build
```

Acessos:
- App: `http://localhost:5173`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

Comandos úteis:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

### Operacao Docker de Producao

Arquivos de producao:
- `docker-compose.prod.yml`
- `.env.prod.example`

Passo rapido:

```bash
cp .env.prod.example .env.prod
# ajuste secrets e dominio
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Consulte `UNIFIED_PLATFORM.md` para TLS, primeiro administrador, broadcast/OBS, Groq, migração de bases legadas e checklist de corte.

### Banco de dados

Use as migrations versionadas; não execute `db push` em produção:

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

**Método Manual:**

1. **Terminal 1 — Backend:**
    ```bash
    cd backend
    npm ci
    npx prisma migrate deploy
    # Configure ADMIN_INITIAL_* antes do primeiro seed.
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

### Administrador inicial

Não há credencial padrão. Crie o primeiro administrador com o seed explícito descrito em `UNIFIED_PLATFORM.md`, injetando usuário e senha pelo secret manager. O seed recusa sobrescrever um administrador existente.

---

## 🚀 Deploy em produção

Para preparar e validar um ambiente de produção, consulte:

| Arquivo | Descrição |
|---------|----------|
| **`UNIFIED_PLATFORM.md`** | Operação Docker unificada: ensino, Groq, OBS, RTMP/HLS, segurança e healthchecks |
| **`DEPLOY.md`** | Guia completo passo a passo (servidor, DB, PM2, Nginx, SSL, backup, monitoramento) |
| **`ecosystem.config.js`** | PM2 cluster mode (N instâncias por core) + 1 worker dedicado FFmpeg/pg-boss |
| **`nginx.conf`** | Nginx reverse proxy (SSL, gzip, HLS direto do disco, cache immutable) |
| **`deploy/postgresql.conf`** | Ponto de partida para tuning PostgreSQL; deve ser ajustado ao hardware e à carga medida |
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
                       PostgreSQL 16 (tuning validado por métricas)
```
