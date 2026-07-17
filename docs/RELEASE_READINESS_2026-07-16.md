# Evidência de prontidão — 16/07/2026

## Decisão

**Aprovado para publicação no repositório e implantação em staging no Railway.**

Esta evidência não autoriza, isoladamente, o go-live de produção. Pentest independente, homologação no staging público, revisão LGPD, validação de acessibilidade e os controles organizacionais de `docs/PRODUCTION_READINESS.md` continuam obrigatórios quando aplicáveis.

## Evidências executadas

| Gate | Resultado controlado |
| --- | --- |
| Qualidade da aplicação | lint, contraste, testes, builds e auditoria de dependências aprovados |
| Backend | 147 testes aprovados |
| Frontend | 8 testes aprovados |
| PostgreSQL | 5 migrations aplicadas em banco vazio e 12 testes de integração aprovados |
| Imagens | backend, frontend, broadcast e broadcast-loop construídas com sucesso |
| Vulnerabilidades corrigíveis | Trivy 0.72.0: zero HIGH/CRITICAL nas quatro imagens, com `--ignore-unfixed` |
| Smoke de staging | 4/4: frontend, API live, API ready e broadcast |
| Segurança HTTP dinâmica | 13/13: headers, CORS, CSRF, autenticação, validação e limite de payload |
| Jornadas E2E | Playwright/Chromium 5/5: disponibilidade, login inválido, admin, logout e aluno |
| Carga isolada | 1.000 requests, concorrência 20, 444,44 req/s, p50 44,1 ms, p95 54,7 ms, p99 60,3 ms, zero erros |
| Restore drill | 53 tabelas/sequências comparadas, dump de 216.585 bytes, restauração e checksum aprovados em 31,8 s |

O gate de segurança HTTP é um DAST objetivo da superfície crítica, mas não é apresentado como pentest independente.

## Artefatos verificados

| Imagem | ID local | Tamanho |
| --- | --- | ---: |
| backend | `sha256:9bdfc0e1913686a0f8bae05c8fcc859341f4a144bbe2e097aa8737d6f1e287df` | 587.535.744 bytes |
| frontend | `sha256:4a7cef0f7dccf38879717306ec6aebcd2a8dc1d03a47cd4ca796fd2f66aadcb3` | 27.838.011 bytes |
| broadcast | `sha256:12507dcd10eb4083dfdcb17f406ac7045529ee90ce9aa965aa8c1d1153df0a6f` | 7.498.383 bytes |
| broadcast-loop | `sha256:6947546b0540d93f51df005f771fed39a9529de6416831bd23ec5082e005cc9f` | 54.959.868 bytes |

Esses IDs identificam as builds locais verificadas. O CI reconstrói os artefatos e repete o bloqueio de vulnerabilidades antes da promoção.

## Automação recorrente

- `.github/workflows/ci.yml`: qualidade, banco PostgreSQL, builds das quatro imagens e Trivy bloqueando HIGH/CRITICAL corrigíveis.
- `.github/workflows/e2e.yml`: execução manual ou semanal das jornadas críticas contra staging.
- `.github/workflows/production-gates.yml`: restore drill semanal, smoke público, segurança HTTP dinâmica e carga.
- Evidências de falha do Playwright são temporárias e não incluem senhas; credenciais existem apenas em secrets do environment `staging`.

## Condições para promover além de staging

1. Configurar os secrets e URLs do environment `staging` no GitHub e no Railway.
2. Implantar o commit aprovado no Railway sem reutilizar os segredos descartáveis do teste local.
3. Executar os três workflows contra o ambiente público e anexar os resultados à release.
4. Concluir pentest independente, homologação funcional e os gates aplicáveis de privacidade, acessibilidade e operação.
