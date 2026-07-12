# Auditoria técnica e arquitetura-alvo

Data-base: 12/07/2026. Escopo: código, dados, segurança, desempenho, infraestrutura, UX, IA e operação do repositório. Este documento registra evidências técnicas; não substitui pentest, DPIA/RIPD, homologação de acessibilidade nem certificação independente.

## Resumo executivo

O produto possui uma base aproveitável: React e Node em TypeScript estrito, PostgreSQL/Prisma, autenticação HttpOnly com CSRF, RBAC, revogação de sessão, processamento assíncrono de vídeo, logs Pino, Docker, health checks, testes e documentação operacional. A estratégia correta é evolução modular, não reescrita total.

Na entrada da auditoria, os bloqueadores eram: 34 erros de lint; tipagem desativada no maior componente; biblioteca `xlsx` com vulnerabilidades altas; senhas de salas privadas em texto puro e expostas pela API; ausência da tabela `PrivateRoom` na migração inicial; design parcialmente escuro e inconsistente; fonte externa; health check com serviço fictício; ausência de CI/CodeQL/Dependabot no repositório.

Os bloqueadores acima foram corrigidos nesta etapa. Testes automatizados, builds, lint e auditorias de dependência passam localmente. A liberação comercial ainda depende dos gates externos descritos em `PRODUCTION_READINESS.md`.

## O que deve ser mantido

- Stack TypeScript, React/Vite, Express, Prisma e PostgreSQL.
- Modelo relacional, constraints, índices e exclusões em cascata já existentes.
- Sessão por cookie HttpOnly, proteção CSRF, RBAC e `tokenVersion`.
- Fila pg-boss e pipeline FFmpeg/HLS.
- Storage local/R2, Docker multi-stage, Nginx e probes.
- Módulos de cursos, aulas, presença, avaliações, certificados, comentários, broadcast e tutor de IA.
- Testes de autenticação, sessão, progresso, mídia, broadcast e IA.

## O que precisa ser refatorado, sem reescrita big-bang

| Prioridade | Módulo | Evidência | Direção |
|---|---|---|---|
| P0 | `AdminDashboard.tsx` | ~174 KB e múltiplos domínios | Extrair páginas por domínio, hooks de consulta e contratos de API |
| P0 | `routes/admin.ts` | ~80 KB e dezenas de handlers | Separar controller/service/repository por domínio |
| P0 | `routes/student.ts` | ~55 KB e tipagem Prisma apagada por `any` | Criar serviços de progresso, presença, fórum e certificados |
| P1 | `index.css` | ~100 KB e estilos históricos sobrepostos | Tokens + componentes e CSS por feature |
| P1 | erros HTTP | Vários `try/catch` duplicados | `AppError`, validação de entrada e middleware único |
| P1 | auditoria | Cobertura parcial de ações mutáveis | Taxonomia, before/after, requestId, ator e retenção |
| P1 | front-end | Sem suíte automatizada | Vitest/Testing Library e Playwright para jornadas críticas |
| P2 | contratos | Tipos duplicados entre API e SPA | OpenAPI e geração de tipos/client |

## Mapa de dependências

```text
Browser/PWA
  -> Nginx/TLS
     -> React/Vite (UI, design system, acessibilidade)
     -> Express API
        -> autenticação/RBAC/CSRF
        -> serviços de domínio
           -> Prisma -> PostgreSQL
           -> pg-boss -> FFmpeg -> HLS/storage
           -> SMTP
           -> Groq (IA, opcional e degradável)
           -> R2/S3 (opcional; fallback local)
Broadcast: OBS/loop -> RTMP Nginx -> HLS -> Campus Live
Operação: health/readiness + logs JSON + Uptime Kuma + backups
```

Dependências críticas são PostgreSQL, filesystem/storage e JWT secret. IA, SMTP, R2 e broadcast precisam falhar de forma isolada sem derrubar cursos, autenticação ou progresso.

## Código duplicado e fragilidade

- Handlers administrativos e estudantis repetem autenticação declarativa, `try/catch`, mensagens e logs.
- Tipos de curso, vídeo, usuário e paginação ainda são definidos localmente.
- Cores e superfícies foram historicamente repetidas; a nova camada clara centraliza tokens, mas a remoção do legado deve continuar por feature.
- CRUDs repetem validação manual. Adotar schemas de entrada compartilhados reduz divergência.
- Chamadas remotas no painel repetem estados de loading/error. Adotar uma camada de queries com cache e invalidação.

## Banco de dados

Pontos fortes: UUIDs, unicidade de matrícula/progresso/certificado, relações explícitas, índices nos caminhos principais e trilha de edição de presença.

Próximas melhorias:

- Criar migrações pequenas e sempre validadas contra PostgreSQL vazio no CI.
- Adicionar índices compostos somente após `EXPLAIN ANALYZE` em dados representativos.
- Definir retenção/anonimização para mensagens de IA, logs, notificações e dados de alunos.
- Separar identificadores legais/educacionais de credenciais; nunca derivar login apenas do nome em escala multi-instituição.
- Planejar tenant/escola antes de vender SaaS multi-rede; hoje o modelo representa uma instalação/organização.

## Segurança e LGPD

Controles presentes: Helmet, CORS restrito, rate limit, CSRF, cookies seguros, JWT com algoritmo fixo, expiração, revogação, bcrypt 12, validação de upload, proteção de HLS/PDF e redaction de logs. PDFs protegidos não são publicados em `R2_PUBLIC_URL`; CDN de material privado exige adapter com URL assinada.

Pendências externas obrigatórias: pentest independente, threat model revisado, inventário de dados, RIPD/DPIA, contrato operador-controlador, canal do titular, política de retenção, teste de restauração, gestão de vulnerabilidades e resposta a incidentes exercitada.

## Desempenho e infraestrutura

Build possui code splitting por rota. O vendor de vídeo é grande (~697 KB bruto), mas está isolado. Antes de prometer capacidade, executar k6 com dados e mídia equivalentes à produção, medir p95/p99, banco, egress e concorrência HLS. O autoscaling da API não resolve gargalo de storage/transcoding.

Docker de produção usa containers restritos, health checks e volumes. A meta é separar API, worker, banco gerenciado, storage de objetos e CDN conforme crescimento.

## Arquitetura proposta

```text
frontend/src/
  app/             # bootstrap, rotas, providers
  design-system/   # tokens e componentes acessíveis
  features/        # auth, courses, lessons, attendance, admin, ai, broadcast
  shared/          # client HTTP, contratos, utilitários

backend/src/
  app/             # servidor, middleware, observabilidade
  modules/
    auth|users|courses|lessons|attendance|forum|certificates|ai|broadcast/
      controller.ts service.ts repository.ts schemas.ts
  shared/          # erros, auditoria, storage, filas
```

Manter um monólito modular agora. Microserviços só quando houver evidência de escalabilidade, ownership separado ou isolamento operacional necessário.

## Cronograma técnico sugerido

| Fase | Duração | Resultado |
|---|---:|---|
| Fundação concluída nesta etapa | 1 ciclo | segurança crítica, tema claro, tipagem, CI, migração e auditoria |
| Modularização P0 | 3–5 semanas | admin/student por domínio, validação e OpenAPI |
| Qualidade de jornada | 2–3 semanas | testes front-end/E2E, acessibilidade WCAG/eMAG e UX research |
| LGPD e operação | 2–4 semanas | RIPD, retenção, restore drill, alertas e runbooks testados |
| Homologação | 2–3 semanas | carga, pentest, correções, piloto e aceite |
| Evolução de mercado | contínua | multi-instituição, integrações e analytics com governança |

Prazo é estimativa para equipe multidisciplinar e depende de escopo, integrações e evidências do piloto.
