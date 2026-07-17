# ADR-001: monólito modular com processos separados

- Status: aceito
- Data: 2026-07-13

## Contexto

A plataforma reúne LMS, operação escolar, IA, broadcast e mídia. Esses domínios compartilham identidade e várias transações, mas processamento de vídeo e ingestão RTMP têm perfis operacionais diferentes.

## Decisão

Manter um único backend implantável, dividido por módulos de domínio, com API HTTP, worker FFmpeg e broadcast executados em processos ou containers separados.

## Consequências

- transações de negócio continuam locais ao PostgreSQL;
- desenvolvimento e deploy permanecem simples;
- boundaries precisam ser impostos por estrutura, testes e revisão;
- API não executa FFmpeg em produção;
- extração futura para serviço separado exige evidência operacional.

## Alternativas rejeitadas

- microserviços por funcionalidade: custo operacional e consistência distribuída prematuros;
- monólito sem módulos: já produziu arquivos grandes e regras misturadas;
- funções serverless para FFmpeg: duração, disco e custo não combinam com a carga atual.
