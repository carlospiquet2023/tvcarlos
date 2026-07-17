# ADR-002: ownership institucional de Course

- Status: pendente
- Data: 2026-07-13

## Contexto

O sistema escolar é multi-tenant por `SchoolOrganization`, enquanto o catálogo LMS (`Course`, `Module`, `Video`) surgiu como catálogo global. `SchoolClass.courseId` pode associar uma turma a esse catálogo, mas `Course` não possui `organizationId`.

## Regra temporária

Até a decisão definitiva, `Course` é catálogo global, administrado globalmente. A associação de turma não concede ownership institucional sobre o conteúdo.

## Alternativas

1. catálogo global compartilhável;
2. curso pertencente a uma organização;
3. curso global com entidade de publicação/licenciamento por organização.

## Critérios para decisão

- necessidade de reutilizar conteúdo entre instituições;
- isolamento jurídico e comercial;
- autoria e fluxo de publicação;
- migração de cursos existentes;
- impacto em matrícula, responsáveis, IA, broadcast e relatórios.

Nenhuma migration de ownership deve ser criada antes dessa decisão de produto e domínio.
