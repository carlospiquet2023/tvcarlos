# Estratégia de qualidade

O gate local e do CI é o mesmo:

```powershell
npm ci
npm ci --prefix api
npx playwright install chromium
npm run quality
```

O Docker deve estar saudável em `http://localhost:8082`; os testes E2E usam as credenciais definidas no `.env`.

## Camadas verificadas

- ESLint 10: erros de escopo, código morto, `eval`, coerção frouxa e uso indevido de console.
- TypeScript em modo estrito: contratos da API, domínio e adapters.
- Vitest: autenticação, hashing, tokens, papéis admin/professor, validação, ciclo de conteúdo, Sala Privada, interação moderada, material de apoio, auditoria, limites e ordenação.
- Cobertura obrigatória: 80% statements, 70% branches, 80% functions e 80% lines no núcleo selecionado.
- Playwright: desktop 1440×900 e celular 390×844, ausência de overflow/colisões, carrossel acima do ticker, menu hamburger, páginas públicas, login e mutação administrativa com limpeza.
- Docker health checks: PostgreSQL, API e Nginx; a programação FFmpeg é observada separadamente pelo status HLS e pelo dashboard operacional.

Falha em qualquer etapa bloqueia o workflow `.github/workflows/quality.yml`. Evidências de falha do navegador ficam em `test-results` e `playwright-report`, ambos ignorados como artefatos gerados.

## Critério de entrega

Uma mudança não está pronta só porque “abre no navegador”. Ela precisa preservar o contrato OpenAPI, passar lint/typecheck/testes, manter containers saudáveis e não degradar os dois viewports de referência. Mudanças em RTMP/HLS também exigem um teste manual curto no OBS porque CI não simula câmera, encoder e rede reais. Mudanças no professor ou Sala Privada devem validar login restrito, troca de página do PDF e moderação de mensagens.
