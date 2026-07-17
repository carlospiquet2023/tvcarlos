# Auditoria técnica

Data-base: 16/07/2026. Escopo: código, persistência, segurança, testes, frontend, infraestrutura e documentação. Esta auditoria registra evidência do repositório; não substitui pentest, RIPD/DPIA, teste de carga, restore drill ou homologação de acessibilidade.

## Resumo

A plataforma adota monólito modular com processos separados para API, worker de vídeo e broadcast. A base possui controles maduros de sessão, mídia e operação, mas continua em uma migração incremental dos antigos arquivos grandes para módulos de domínio.

Não existe nota “10/10” comprovável apenas por refatoração. O repositório pode eliminar riscos estruturais; segurança, escala e disponibilidade exigem evidência externa e operação real.

## Evolução verificada nesta refatoração

- aplicação Express separada do bootstrap e importável sem abrir porta;
- worker pg-boss/FFmpeg com entrypoint próprio e sem servidor HTTP;
- boundary comum para erro HTTP, async handlers e validação;
- importação Excel movida para caso de uso transacional e testável;
- políticas de aulas ao vivo e moderação extraídas de `student.ts`;
- chamada e notas movidas para serviços acadêmicos transacionais;
- setup, bootstrap e insights escolares em serviços de domínio;
- FKs compostas, checks e triggers protegem novas escritas nas relações institucionais cobertas;
- escopo opcional de campus passou a ser aplicado na autorização;
- painel administrativo decomposto por `features/admin`, com componentes e tipos por responsabilidade;
- URL base e resolução de mídia centralizadas no frontend;
- testes frontend adicionados e integrados ao quality gate;
- Docker Compose, PM2 e Supervisor separam API e worker;
- documentação de arquitetura, tenancy e testes reescrita;
- alegações de capacidade sem evidência e credencial padrão foram removidas.

## Avaliação atual

| Área | Antes | Estado após refatoração | Evidência ainda necessária |
|---|---:|---:|---|
| Infraestrutura e deploy | 8 | 9 | build/scan da imagem e deploy canário |
| Segurança | 8 | 9 | pentest, threat model e exercício de incidente |
| Modelagem e persistência | 7 | 9 | aplicar/auditar migration em cópia anonimizada |
| Organização backend | 5 | 8 | terminar decomposição de `admin.ts` e `student.ts` |
| Organização frontend | 4 | 8 | concluir hooks de consulta e adicionar design system |
| Testabilidade | 5 | 9 | E2E das jornadas críticas, carga e restore drill |
| Documentação | 6 | 9 | revisão operacional após staging |

As notas são uma leitura técnica interna, não certificação.

## Pontos fortes

- TypeScript estrito, React/Vite, Express, Prisma e PostgreSQL;
- cookies HttpOnly, CSRF, JWT fixo, expiração e revogação por `tokenVersion`;
- RBAC global e autorização institucional/campus;
- validação de upload e proteção de HLS/PDF;
- pg-boss e FFmpeg isolados do processo HTTP em produção;
- logs estruturados, request ID, health/readiness e graceful shutdown;
- migrations versionadas e testadas em PostgreSQL vazio, com 12 cenários reais de integridade e multitenancy;
- CI, CodeQL, Dependabot, lint, testes, build e auditoria de dependências;
- documentação de SLO, incidentes, LGPD e governança de IA.

## Débito estrutural restante

| Prioridade | Evidência | Próxima ação |
|---|---|---|
| P1 | `routes/admin.ts` ainda agrega catálogo, mídia e comunicação | continuar extração incremental para routers/serviços próprios |
| P1 | `AdminDashboard.tsx` permanece como container de orquestração extenso | mover consultas/mutações para hooks por feature |
| P1 | `routes/student.ts` mantém múltiplas jornadas | continuar extração de certificados, quiz e comentários |
| P1 | `schoolRouter.ts` ainda é fachada extensa | dividir routers por organização, turma, diário e família |
| P1 | ausência de E2E de navegador | cobrir login, matrícula, aula, chamada, nota e responsável |
| P1 | migration tenant ainda não aplicada em base legada | seguir rollout de `DATA_AND_TENANCY.md` |
| P2 | tipos frontend/backend manuais | gerar cliente/tipos pelo OpenAPI |
| P2 | CSS e estilos inline históricos | consolidar tokens e componentes acessíveis |

## Decisão de domínio pendente

O sistema escolar usa `SchoolOrganization` como tenant. O catálogo LMS usa `Course` global e pode ser ligado opcionalmente a uma turma. Antes de vender isolamento completo de conteúdo por instituição, é necessário decidir entre catálogo global, ownership direto ou publicação/licenciamento por organização. Consulte `docs/architecture/ADR-002-COURSE-OWNERSHIP.md`.

## Segurança e privacidade

Controles presentes reduzem risco técnico, mas liberação com dados reais continua condicionada a:

- pentest independente e reteste;
- inventário de dados e RIPD/DPIA;
- retenção e descarte aprovados;
- backup cifrado e restauração cronometrada;
- secret manager, MFA operacional e menor privilégio;
- revisão de logs e canais de direitos do titular;
- governança humana do uso de IA.

## Escala

O repositório não promete quantidade fixa de usuários simultâneos. A aprovação depende de perfil de carga, bitrate, catálogo, hardware, pool de banco, egress, p95/p99 e taxa de erro. Múltiplas réplicas exigem storage de objetos, rate limit compartilhado e migration executada por job único.

## Critério de conclusão

O código está pronto para staging quando o quality gate passa e a migration é aplicada em banco descartável. Produção permanece `no-go` enquanto qualquer gate aplicável de `docs/PRODUCTION_READINESS.md` estiver sem responsável e evidência.
