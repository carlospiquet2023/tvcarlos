# Gates dinâmicos de segurança e carga

Estes gates dão uma verificação reproduzível antes da promoção de um ambiente. Eles usam apenas recursos nativos do Node.js 22 e encerram com código `0` quando todos os critérios passam ou `1` quando há falhas.

Eles devem ser executados contra um ambiente isolado e representativo de staging. O gate de segurança é um smoke test automatizado de controles HTTP; **não é e não substitui um pentest independente**, revisão de código especializada, análise de dependências ou threat modeling. O gate de carga também não substitui um ensaio de capacidade com tráfego e dados representativos.

## Pré-requisitos

- Node.js 22.
- API em execução, com banco e dependências de staging saudáveis.
- Origem do frontend configurada na API e conhecida pelo executor.
- Para alvos externos, autorização para gerar o volume escolhido.

Não execute carga contra produção sem janela aprovada, monitoramento ativo e plano de interrupção.

## Gate de segurança dinâmica

Execução local padrão:

```powershell
node scripts/security-gate.mjs
```

Execução em staging:

```powershell
$env:SECURITY_TARGET_URL='https://api.staging.example.com'
$env:SECURITY_ALLOWED_ORIGIN='https://staging.example.com'
node scripts/security-gate.mjs
```

O script não cria nem altera dados. Ele valida:

- headers defensivos do Helmet e ausência de `X-Powered-By`;
- CORS da origem configurada, preflight e não reflexão de uma origem adversária;
- bloqueio CSRF para uma operação mutável com cookie de sessão sem token;
- autenticação obrigatória em métricas, perfil, administração e área do aluno;
- falha segura de login inválido;
- rejeição de JSON malformado, tipos semelhantes a operadores de consulta e corpo acima do limite;
- ausência de detalhes comuns de stack, Prisma e PostgreSQL nas respostas exercitadas.

Configuração:

| Variável | Padrão | Finalidade |
|---|---|---|
| `SECURITY_TARGET_URL` | `http://localhost:3000` | Origem da API |
| `SECURITY_ALLOWED_ORIGIN` | `http://localhost:5173` | Origem que deve ser autorizada por CORS |
| `SECURITY_DISALLOWED_ORIGIN` | `https://attacker.invalid` | Origem que não pode ser refletida |
| `SECURITY_TIMEOUT_MS` | `5000` | Timeout de cada requisição |
| `SECURITY_OVERSIZED_BODY_BYTES` | `3145728` | Tamanho do corpo usado para verificar HTTP 413; configure acima de `JSON_BODY_LIMIT` |

Uma falha deve bloquear a promoção até ser explicada. Se um proxy remove ou adiciona headers, execute o gate na URL pública do staging para validar o caminho real do cliente.

## Gate de carga

O cenário padrão aquece o alvo com 20 requisições e mede 500 chamadas a `GET /health/live` com concorrência 20:

```powershell
node scripts/load-gate.mjs
```

Exemplo para uma leitura autenticada:

```powershell
$env:LOAD_TARGET_URL='https://api.staging.example.com'
$env:LOAD_PATH='/api/student/my-courses'
$env:LOAD_AUTH_TOKEN='<token-de-teste-de-curta-duracao>'
$env:LOAD_REQUESTS='2000'
$env:LOAD_CONCURRENCY='50'
node scripts/load-gate.mjs
```

O relatório apresenta duração, throughput, p50, p95, p99, erros totais, erros HTTP 5xx e distribuição dos status. Corpos de resposta são consumidos para medir o ciclo HTTP completo, mas não são armazenados.
O warmup não entra nas métricas e deve passar sem falhas antes de começar a medição.

Limites padrão, alinhados a [SLO.md](./SLO.md):

- p95 menor que 500 ms para leitura;
- p95 menor que 750 ms quando `LOAD_METHOD` é `POST`, `PUT`, `PATCH` ou `DELETE`;
- taxa total de erros no máximo 0,5%;
- taxa de respostas 5xx estritamente menor que 0,5%.

| Variável | Padrão | Finalidade |
|---|---|---|
| `LOAD_TARGET_URL` | `http://localhost:3000` | Origem da API |
| `LOAD_PATH` | `/health/live` | Caminho ou URL resolvida contra o alvo |
| `LOAD_METHOD` | `GET` | Método HTTP |
| `LOAD_WARMUP_REQUESTS` | `20` | Chamadas fora da medição; aceita `0` |
| `LOAD_REQUESTS` | `500` | Total medido |
| `LOAD_CONCURRENCY` | `20` | Workers concorrentes |
| `LOAD_TIMEOUT_MS` | `5000` | Timeout por chamada |
| `LOAD_EXPECTED_STATUS` | `200-399` | Status ou faixas separados por vírgula |
| `LOAD_MAX_P95_MS` | `500`/`750` | Sobrescreve o p95 máximo |
| `LOAD_MAX_ERROR_RATE_PERCENT` | `0.5` | Percentual máximo de falhas totais |
| `LOAD_MAX_5XX_RATE_PERCENT` | `0.5` | Percentual máximo de 5xx |
| `LOAD_AUTH_TOKEN` | vazio | Bearer token de usuário de teste |
| `LOAD_COOKIE` | vazio | Cookies de uma sessão de teste |
| `LOAD_CSRF_TOKEN` | vazio | Header `X-XSRF-TOKEN` para escrita com cookie |
| `LOAD_BODY` | vazio | Corpo enviado em métodos de escrita |
| `LOAD_CONTENT_TYPE` | `application/json` | Content-Type do corpo |

Para escrita, use somente uma conta e dados descartáveis, e torne o cenário idempotente ou providencie limpeza. Tokens e cookies devem ser injetados como segredos do executor e nunca gravados em logs ou no repositório.

## Interpretação e homologação

Um resultado verde comprova apenas o alvo, a configuração e a janela executados. Registre junto da homologação:

1. commit e imagem testados;
2. URL, horário, volume e concorrência (sem credenciais);
3. saída completa dos dois gates;
4. métricas do banco, API, worker e proxy durante a carga;
5. aceite do responsável e desvios conhecidos.

Antes de produção ainda são necessários pentest independente proporcional ao risco, E2E dos fluxos críticos, restore drill documentado, observabilidade/alertas ativos e homologação funcional no staging.
