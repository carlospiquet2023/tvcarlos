# Evidência da release — 12/07/2026

## Resultado executado localmente

- `npm run quality`: aprovado.
- Front-end: ESLint e TypeScript aprovados; bundle de produção gerado.
- Back-end: TypeScript aprovado; 12 arquivos e 89 testes aprovados.
- Dependências de produção: `npm audit --omit=dev` com zero vulnerabilidades conhecidas no front-end e back-end.
- Prisma: schema formatado, validado e cliente gerado.
- Compose local e produção: configuração YAML validada.
- Migração escolar: correspondência estática de 20 modelos/20 tabelas, 11 enums, 44 chaves estrangeiras e 52 índices.

## Capacidades desta release

- Multi-instituição com unidades, memberships e isolamento explícito por organização.
- Ano/períodos, currículo, turmas, matrículas, responsáveis, docentes e horários.
- Espaço da turma com diário, frequência, avaliações, publicação e notas.
- Portal familiar com escopo por vínculo, agenda, horários, notas publicadas e frequência.
- Papéis globais e institucionais separados; professor limitado às turmas atribuídas.
- Primeiro acesso obrigatório para todos os perfis, cookie HttpOnly, CSRF e revogação.
- Período fechado impede mutações de diário e notas sem reabertura formal.
- Qualidade cadastral para prontidão Educacenso e exportação auditada alinhada ao OneRoster 1.2.
- Radar explicável de permanência com acesso restrito e trilha de auditoria.

## Gates externos ainda obrigatórios

O Docker Desktop não estava ativo nesta estação. Por isso, a aplicação das migrações em PostgreSQL vazio, o build das imagens e o teste integrado dos containers devem ser executados pela CI ou em ambiente de homologação antes de promover a release.

Também permanecem `no-go` até evidência independente: restauração de backup, teste de carga, pentest/reteste, auditoria WCAG 2.2 AA e eMAG, RIPD/LGPD, homologação SMTP/TLS/domínio, piloto com usuários reais e certificações/conectores comerciais anunciados no contrato.

Não declarar certificação OneRoster, integração Educacenso homologada ou conformidade legal apenas com base no código. A exportação é alinhada ao modelo e a qualidade cadastral é preparatória; certificação e transmissão oficial exigem os processos das entidades responsáveis.
