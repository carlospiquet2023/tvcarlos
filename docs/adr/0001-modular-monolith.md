# ADR 0001 — Monólito modular com adapters

- Status: aceito
- Data: 2026-06-22

## Contexto

A plataforma combina site público, painel, API, PostgreSQL, uploads e RTMP/HLS. Separar tudo em microserviços agora aumentaria deploys, falhas de rede, observabilidade e custo operacional sem demanda que justifique isso. Manter um bloco único, por outro lado, tornaria regras, persistência e transporte inseparáveis.

## Decisão

Usar um monólito modular no backend, com dependências apontando para dentro:

```text
HTTP -> Application -> Domain
          ^     ^
          |     |
   PostgreSQL  Storage
      adapters de ports
```

No navegador, `app.js` e `admin.js` são composition roots pequenos. Estado, player, programação, marca, parceiros, navegação, ticker, recursos administrativos, segurança e operações vivem em módulos próprios. CSS público é dividido por responsabilidade e o painel possui tema isolado.

## Consequências

- Banco e storage podem ser substituídos implementando ports e migrations específicas.
- Casos de uso são testáveis sem Fastify/PostgreSQL.
- Uma única unidade de deploy mantém transações e operação simples.
- Escala independente exige extrair um limite apenas quando métricas comprovarem a necessidade.
- O contrato HTTP é documentado em `docs/openapi.yaml`; adapters não podem vazar SQL ou detalhes de filesystem para domínio/aplicação.
