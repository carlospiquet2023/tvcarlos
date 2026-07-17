# Arquitetura da plataforma

Este documento é a fonte canônica da arquitetura do código. Ele descreve o que existe hoje, os limites de responsabilidade e as condições necessárias para escalar. Não constitui, sozinho, evidência de capacidade para uma quantidade específica de usuários.

## Decisão principal

A plataforma é um **monólito modular** com processos operacionais separados. Essa forma preserva transações locais, implantação simples e baixo custo operacional, sem acoplar processamento de mídia ao processo HTTP.

Microserviços só devem ser considerados quando métricas reais demonstrarem necessidade de escala, isolamento de falhas ou ciclos de entrega independentes. Tamanho de arquivo não é motivo suficiente para distribuir o sistema.

```text
Navegador
   │ HTTPS
   ▼
Frontend/Nginx ─────── arquivos estáticos React
   │
   ├── /api/* ───────► API Express
   ├── /hls/* ───────► HLS protegido
   └── /broadcast/* ─► Nginx RTMP/HLS
                          │
API Express ──────────────┼──── PostgreSQL/Prisma
   │                      └──── pg-boss
   ├── Groq
   ├── SMTP
   └── storage local ou S3/R2 conforme política

Worker de vídeo ── pg-boss ── FFmpeg ── storage/HLS
```

## Processos e responsabilidades

| Processo | Responsabilidade | Não deve fazer |
|---|---|---|
| `frontend` | Servir SPA, proxy de borda, HLS e broadcast | Acessar segredos ou banco |
| `api` | Autenticação, autorização, comandos e consultas | Processar FFmpeg em produção |
| `worker` | Consumir `video-process` e executar FFmpeg | Abrir porta HTTP |
| `broadcast` | Ingestão RTMP e publicação HLS | Acessar banco diretamente |
| `database` | Estado transacional e fila pg-boss | Ser exposto à internet |

Em desenvolvimento, a API pode executar o worker embutido. Em produção, API e worker são processos distintos.

## Composição do backend

O ciclo de vida é separado da aplicação HTTP:

- `backend/src/app.ts`: cria e configura a aplicação Express, sem abrir socket;
- `backend/src/main.ts`: valida ambiente, abre o servidor e coordena shutdown;
- `backend/src/worker.ts`: inicializa apenas o consumidor de vídeo;
- `backend/src/server.ts`: shim temporário de compatibilidade para entradas antigas;
- `backend/src/lib/http.ts`: boundary comum de erros e handlers assíncronos.

Essa separação permite testes HTTP em memória e evita efeitos colaterais ao importar a aplicação.

## Módulos de domínio

| Módulo | Responsabilidade |
|---|---|
| `identity`/`auth` | Sessão, credenciais, revogação e papéis globais |
| `admin` | Administração global e operações de conteúdo legado |
| `learning` | Cursos, aulas, progresso, certificados e aulas ao vivo |
| `school` | Instituições, campus, anos, turmas, diário, notas e responsáveis |
| `forum` | Comentários, violações, sanções e recursos |
| `broadcast` | Programação, parceiros, ticker e autorização RTMP |
| `ai` | Perfil pedagógico, conversas e integração com provedor |
| `media` | Upload, armazenamento, fila e transcodificação |

### Regra de dependência

O fluxo esperado é:

```text
route/controller → application service → domain policy → Prisma/integration
```

- A rota traduz HTTP, valida formato e escolhe o caso de uso.
- O serviço define transação, autorização contextual e resultado.
- Políticas puras não dependem de Express ou Prisma.
- Integrações externas ficam atrás de módulos próprios.
- Respostas HTTP não devem ser enviadas antes de auditorias obrigatórias terminarem.

Novas regras de negócio não devem ser adicionadas diretamente a `routes/admin.ts`, `routes/student.ts` ou `schoolRouter.ts`. Esses arquivos são fachadas legadas em decomposição gradual.

## Persistência e transações

O Prisma é o adaptador de persistência. Uma transação deve abranger todas as alterações que representam um único fato de negócio, incluindo seu registro de auditoria quando obrigatório.

Exemplos:

- importação de estudantes: usuários e matrículas são gravados atomicamente; e-mails são enviados após commit;
- chamada e notas: lote, fechamento da sessão e auditoria compartilham transação;
- configuração de grade/horário: substituição e auditoria compartilham transação;
- processamento de vídeo: estado do job é persistido e o processamento é idempotente.

Migrations são append-only e aplicadas com `prisma migrate deploy`. `db push` não é uma estratégia de produção.

## Multi-tenancy escolar

`SchoolOrganization` é o tenant do sistema escolar. Identificadores fornecidos pelo cliente nunca bastam: autorização e consultas devem incluir a organização derivada do vínculo ativo.

O banco protege as relações críticas com chaves compostas:

- campus pertence à organização;
- ano letivo pertence à organização;
- turma referencia campus e ano da mesma organização;
- matrícula referencia turma da mesma organização;
- oferta referencia turma e disciplina da mesma organização;
- sessões e avaliações usam período compatível com o ano da turma.

Membros com escopo de campus só podem operar naquele campus. Administrador global é a única exceção explícita.

### Limite conhecido: catálogo LMS

`Course` ainda é global e `SchoolClass.courseId` é opcional. Até existir ownership institucional explícito, curso deve ser tratado como catálogo compartilhável administrado globalmente. Não se deve inferir isolamento tenant de conteúdo LMS apenas por essa relação.

A decisão futura deve escolher uma alternativa:

1. manter catálogo global e documentar compartilhamento;
2. adicionar `organizationId` a `Course`;
3. criar uma entidade de publicação que associe um curso global a uma organização.

Detalhes de rollout estão em `docs/architecture/DATA_AND_TENANCY.md`.

## Segurança

O modelo usa defesa em profundidade:

- sessão em cookie HttpOnly e token CSRF vinculado à sessão;
- JWT com algoritmo e expiração fixos, `tokenVersion` e revogação;
- autorização global por `Role` e escolar por `SchoolMembership`;
- rate limits específicos para login, credenciais, uploads e progresso;
- Helmet, CORS explícito, limites de corpo e validação de upload;
- HLS com token curto e escopo por vídeo;
- PDF protegido por matrícula ou atribuição docente;
- segredos apenas no backend;
- logs estruturados com request ID e mensagens de erro seguras;
- auditoria para alterações administrativas e acadêmicas.

Rate limit em memória é suficiente apenas para uma instância. Múltiplas réplicas exigem store compartilhado.

## Frontend

O frontend é uma SPA React com rotas carregadas sob demanda. A organização-alvo é por funcionalidade:

```text
src/
  app/          composição, providers e rotas
  features/     admin, learning, school, family, broadcast, ai
  components/   componentes realmente compartilhados
  lib/          cliente HTTP, URLs e utilitários sem domínio
  pages/        composição fina de cada rota
```

Regras:

- páginas coordenam features; não devem concentrar formulários, tabelas e acesso HTTP;
- cada feature mantém tipos, API, hooks e componentes próximos;
- `lib/api.ts` é o único cliente HTTP base;
- URLs de mídia são resolvidas por utilitário comum;
- autorização do frontend melhora UX, mas o backend continua sendo a autoridade;
- contratos tolerantes a legado devem ser normalizados em um único local.

## Contratos HTTP

Endpoints novos do sistema escolar usam `/api/v1/school`. Respostas bem-sucedidas usam `{ data }`; erros expõem mensagem segura e request ID quando disponível.

O OpenAPI escolar fica em `docs/openapi-school.yaml`. Mudanças incompatíveis exigem nova versão de rota ou período de compatibilidade explícito. Tipos duplicados manualmente entre frontend e backend devem ser substituídos gradualmente por geração a partir do contrato.

## Testes

A pirâmide mínima é:

1. políticas puras: rápidas e sem infraestrutura;
2. serviços: dependências controladas e transações verificadas;
3. HTTP: aplicação criada em memória, autenticação e erro real;
4. integração PostgreSQL: constraints, migrations e consultas críticas;
5. frontend: utilitários, componentes e estados de erro;
6. E2E: login, matrícula, aula, chamada, nota e importação;
7. carga: cenários representativos com critérios de aprovação.

O CI executa lint, typecheck, testes, build, auditoria de dependências, validação do Prisma e migrations sobre PostgreSQL vazio. Cobertura numérica não substitui testes de risco.

## Observabilidade e operação

- `/health/live`: processo responde; não consulta dependências;
- `/health/ready`: processo pronto e banco acessível;
- `/api/metrics`: métricas operacionais protegidas por ADMIN;
- logs: JSON estruturado, request ID e ausência de segredos;
- shutdown: para tráfego, worker e conexões antes do timeout;
- backup: banco e objetos precisam de restauração ensaiada;
- deploy: migration é job único antes de escalar réplicas.

Alertas mínimos: taxa de 5xx, latência p95/p99, falhas de login, fila parada, jobs com retry, espaço de storage, falha de backup, restart loop e indisponibilidade de banco.

## Escala

O modo local atual é adequado para uma única máquina. Para múltiplos hosts:

1. usar storage de objetos privado para originais e derivados persistentes;
2. separar workers FFmpeg da API;
3. usar rate limit distribuído;
4. aplicar migrations em job único;
5. manter HLS ao vivo próximo da borda/CDN;
6. validar pool de conexões e limites do PostgreSQL;
7. executar carga com dados e consultas equivalentes aos reais.

Nenhuma afirmação de “10 mil alunos” é válida sem perfil de simultaneidade, SLO, hardware, volume de mídia e relatório de carga reproduzível.

## Quality gates arquiteturais

Uma mudança está pronta quando:

- não introduz nova regra em arquivo legado sem justificativa;
- valida input e autorização no boundary correto;
- mantém invariantes de tenant no banco ou em política testada;
- registra auditoria dentro da transação quando aplicável;
- possui teste proporcional ao risco;
- atualiza OpenAPI e documentação quando muda contrato;
- passa lint, typecheck, testes, build e migrations;
- não adiciona segredo, endpoint interno ou storage protegido à superfície pública.

## Documentos relacionados

- `UNIFIED_PLATFORM.md`: topologia e execução da stack;
- `docs/architecture/README.md`: índice e decisões;
- `docs/architecture/DATA_AND_TENANCY.md`: persistência multi-tenant;
- `docs/architecture/TESTING_STRATEGY.md`: estratégia e matriz de testes;
- `SECURITY.md`: controles e resposta de segurança;
- `docs/SLO.md`: objetivos operacionais;
- `RUNBOOK.md`: resposta a incidentes;
- `docs/openapi-school.yaml`: contrato da API escolar.
