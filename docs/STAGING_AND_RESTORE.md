# Homologação de staging e restore drill

Este documento define os gates operacionais que precisam passar antes de promover uma versão. Eles verificam a aplicação já implantada e a capacidade de restaurar um backup lógico; não substituem pentest, teste de carga ou um plano completo de continuidade.

## 1. Smoke test de staging

O script `scripts/staging-smoke.mjs` usa apenas Node.js 22 e verifica:

- o HTML do frontend e o ponto de montagem React;
- `GET /health/live` da API;
- `GET /health/ready`, incluindo a disponibilidade do PostgreSQL;
- `GET /api/broadcast/status` pelo gateway público e o contrato da resposta.

O frontend e a API têm origens separadas porque a configuração de produção não publica os health checks internos da API no frontend. Execute o smoke a partir da rede de monitoramento ou informe a URL segura do serviço de API em staging.

### PowerShell

```powershell
$env:STAGING_BASE_URL = 'https://staging.exemplo.com'
$env:STAGING_API_URL = 'https://api-staging.exemplo.com'
node scripts/staging-smoke.mjs
```

### Linux/macOS

```bash
STAGING_BASE_URL=https://staging.exemplo.com \
STAGING_API_URL=https://api-staging.exemplo.com \
node scripts/staging-smoke.mjs
```

Variáveis opcionais:

| Variável | Padrão | Uso |
|---|---:|---|
| `SMOKE_ATTEMPTS` | `3` | Tentativas por endpoint com backoff |
| `SMOKE_TIMEOUT_MS` | `10000` | Timeout de cada requisição |
| `SMOKE_REQUIRE_BROADCAST_AVAILABLE` | `true` | Exige comunicação API → broadcast; `false` só valida o contrato |
| `SMOKE_ALLOW_HTTP` | `false` | Permite HTTP fora de localhost somente em rede controlada |

Nenhuma URL pode conter usuário ou senha. O script registra somente protocolo, host e caminho.

## 2. Restore drill

Os scripts `scripts/backup-restore-drill.ps1` e `scripts/backup-restore-drill.sh` executam o mesmo fluxo:

1. calculam a contagem e um checksum independente da ordem para cada tabela, além do estado das sequences em `public`;
2. geram um `pg_dump` em formato customizado;
3. confirmam que o conjunto comparado não mudou durante o backup;
4. iniciam um PostgreSQL 16 efêmero, sem porta publicada;
5. restauram com transação única e falha imediata;
6. comparam contagens e checksums e removem container, credencial, manifesto e backup.

O drill nunca executa `DROP`, `CREATE` ou migrations na origem. Use uma credencial dedicada com conexão, leitura do catálogo e `SELECT` nas tabelas e sequences. Para um resultado estável, rode em janela de baixa escrita ou contra réplica consistente. A política TLS vem da própria URL; em ambientes remotos use `sslmode=require` ou mais restritivo.

### PowerShell (Windows + Docker Desktop)

```powershell
$env:RESTORE_SOURCE_DATABASE_URL = 'postgresql://usuario:<senha-percent-encoded>@host:5432/banco?sslmode=require'
./scripts/backup-restore-drill.ps1
```

Se o PostgreSQL estiver na máquina Windows, use `host.docker.internal` como host da URL. Também é possível fornecer a URL só para o processo:

```powershell
./scripts/backup-restore-drill.ps1 -SourceDatabaseUrl $env:DATABASE_URL
```

### CI/Linux

```bash
RESTORE_SOURCE_DATABASE_URL="$DATABASE_URL" ./scripts/backup-restore-drill.sh
```

Se a origem estiver em outro container, defina `DRILL_DOCKER_NETWORK` com o nome da rede Docker compartilhada. `DRILL_POSTGRES_IMAGE` permite fixar outra imagem compatível, mas a versão deve ser igual ou superior à versão da origem e conter as extensões exigidas pelo schema. O destino usa um tmpfs de `1g`; ajuste `DRILL_TARGET_TMPFS_SIZE` quando o backup exigir mais espaço.

### Critérios de aprovação

- `pg_dump` termina sem warnings fatais;
- `pg_restore --exit-on-error --single-transaction` termina com sucesso;
- todas as tabelas de `public` têm a mesma contagem e as mesmas somas dos hashes MD5 de linha (usadas somente como checksum de integridade);
- todas as sequences de `public` mantêm `last_value` e `is_called`;
- o manifesto da origem permanece igual antes e depois do dump;
- o container e os arquivos temporários são removidos inclusive em falhas.

O checksum é uma verificação básica de integridade, não uma assinatura criptográfica de cada linha. O drill mede o tempo total no log, mas só comprova RTO quando o limite aceito pela operação estiver formalizado. O RPO depende da frequência e retenção do backup real.

## 3. Dados fora do PostgreSQL

Vídeos, HLS, imagens e PDFs ficam no volume/object storage e não entram no `pg_dump`. A homologação de recuperação completa também deve:

- restaurar uma cópia do storage em bucket/volume isolado;
- conferir quantidade, tamanho e hashes de uma amostra representativa;
- abrir uma aula com vídeo, imagem e PDF;
- validar a política de retenção e o versionamento do provedor.

Nunca aponte o exercício para o bucket gravável de produção.

## 4. Gate no GitHub Actions

O workflow `production-gates.yml` roda semanalmente e também por acionamento manual. Configure os secrets do repositório ou environment:

- `RESTORE_SOURCE_DATABASE_URL`: idealmente uma réplica/read-only dedicada ao drill;
- `STAGING_BASE_URL`: origem pública do frontend;
- `STAGING_API_URL`: origem segura da API acessível pelo runner.

No acionamento manual, as URLs de staging podem ser passadas como inputs; a URL do banco permanece sempre em secret. Proteja o environment de produção com aprovação humana e use os resultados como evidência da homologação.

## 5. Checklist de promoção

- Quality Gate e build das imagens aprovados no commit exato.
- Migrations ensaiadas em banco vazio e no clone de staging.
- Restore drill aprovado e duração registrada.
- Smoke de staging aprovado após o deploy.
- E2E, teste de carga e análise de segurança aprovados.
- Rollback de aplicação ensaiado; migrations destrutivas têm estratégia compatível.
- Responsável técnico registra versão, horário, evidências e decisão de go/no-go.
