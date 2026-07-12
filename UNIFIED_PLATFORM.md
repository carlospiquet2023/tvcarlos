# Plataforma unificada: ensino, IA e broadcast

Este stack mantém uma única entrada web e integra o núcleo educacional ao broadcast da TV. O navegador acessa somente o `frontend`; API, autorização RTMP e HLS ao vivo permanecem em redes internas do Compose.

## Serviços

| Serviço | Responsabilidade | Exposição |
|---|---|---|
| `frontend` | SPA, gateway `/api`, aulas `/hls` e TV `/broadcast` | 5173 em desenvolvimento; 80 em produção |
| `backend` | identidade, ensino, autorização RTMP, IA e auditoria | 4000 apenas local em desenvolvimento; interno em produção |
| `broadcast` | ingestão RTMP, geração HLS e status de `stream`/`loop` | 1935 conforme bind; HTTP 8080 somente interno |
| `broadcast-loop` | playlist FFmpeg opcional | profile `broadcast-loop`, sem porta pública |
| `db` | PostgreSQL e fila pg-boss | 5432 apenas local em desenvolvimento |
| `uploads-init` | corrige uma vez por inicialização a posse do volume para o usuário não-root | sem rede |

Redes `broadcast-net`/`broadcast-prod-net` são internas. O serviço RTMP também participa de uma rede de borda exclusiva para que a porta publicada funcione sem colocá-lo na rede do banco. Os containers de aplicação usam filesystem somente leitura, capabilities removidas, `no-new-privileges`, diretórios temporários em `tmpfs` e logs com rotação.

## Inicialização

Desenvolvimento:

```bash
cp .env.example .env
docker compose up --build -d
```

Com a programação automática da playlist:

```bash
docker compose --profile broadcast-loop up --build -d
```

Produção:

```bash
cp .env.prod.example .env.prod
# Preencha todos os valores obrigatórios com segredos novos.
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

O Compose de produção entrega HTTP na porta 80. TLS deve terminar em Caddy, Traefik, Nginx gerenciado ou no balanceador da nuvem antes da liberação pública. Preserve `X-Forwarded-Proto` e o IP real do cliente.

### Banco novo, banco legado e administrador inicial

O backend usa `prisma migrate deploy`; ele não executa mais `db push` silenciosamente. A migration inicial versionada fica em `backend/prisma/migrations/20260710210000_initial_unified_platform`.

Para uma instalação nova, `docker compose up` aplica a migration automaticamente. Em seguida, crie o primeiro administrador uma única vez:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm \
  -e ADMIN_INITIAL_EMAIL=admin@seu-dominio.com.br \
  -e ADMIN_INITIAL_USERNAME=admin \
  -e ADMIN_INITIAL_PASSWORD='SUBSTITUA_POR_SENHA_FORTE' \
  backend node dist/prisma/seed.js
```

Não deixe a senha no histórico do shell: em produção, prefira injetá-la pelo secret manager ou por um arquivo temporário protegido. O seed nunca redefine a senha de um administrador existente e recusa reutilizar o e-mail de uma conta sem papel `ADMIN`.

Se o volume já foi criado por versões antigas que usavam `prisma db push`, faça backup e ensaie a atualização em staging. No primeiro boot dessa base antiga, use uma única vez `MIGRATION_MODE=legacy-baseline` e `ALLOW_LEGACY_BASELINE=true`; o processo sincroniza apenas alterações sem perda aceita e marca a migration inicial como baseline. Depois, volte obrigatoriamente para `MIGRATION_MODE=deploy`.

A variável `DATABASE_URL` de produção é explícita. Se a senha tiver `@`, `:`, `/`, `?`, `#` ou `%`, aplique percent-encoding na parte da senha da URL; `POSTGRES_PASSWORD` continua contendo o valor original.

## OBS e HLS

Com `RTMP_BIND_ADDRESS` acessível ao computador do operador:

- servidor OBS: `rtmp://HOST:1935/live`
- chave de transmissão: `stream?token=VALOR_DE_RTMP_STREAM_KEY`
- status público confiável: `/api/broadcast/status`
- playlist ao vivo: `/broadcast/hls/stream.m3u8`
- playlist automática: `/broadcast/hls/loop.m3u8`

O Nginx não registra os argumentos RTMP. Cada publicação chama `POST /internal/broadcast/authorize` no backend; somente os nomes `stream` e `loop`, com suas chaves correspondentes, devem ser aceitos.

O backend determina atividade pelo `rtmp_stat` interno e exige uma sessão realmente em publicação; a existência de uma playlist antiga não é tratada como sinal ao vivo. `/broadcast/stat` é bloqueado no gateway público.

RTMP puro não cifra a chave. Em produção, prefira VPN/túnel privado e `RTMP_BIND_ADDRESS=127.0.0.1`. Se for indispensável usar `0.0.0.0`, restrinja a porta 1935 ao IP do OBS no firewall e envolva a ingestão em transporte cifrado.

## Playlist automática

Edite `broadcast/playlist.txt` com um nome de arquivo por linha. Os nomes são relativos ao diretório persistente `uploads/videos`; linhas vazias, comentários, caminhos absolutos e travessia `..` são rejeitados. O profile recarrega a playlist ao terminar cada ciclo.

O HLS ao vivo é efêmero em `tmpfs`: reiniciar `broadcast` interrompe a transmissão e recria as playlists. Vídeos-fonte continuam no volume persistente.

## Groq

Variáveis exclusivas do backend:

```dotenv
GROQ_API_KEY=uma-chave-nova
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_FALLBACK_MODEL=openai/gpt-oss-120b
GROQ_MODEL_SWITCH_AT=2026-07-17T00:00:00.000Z
```

O modelo Scout solicitado deve ser trocado automaticamente na data configurada em `GROQ_MODEL_SWITCH_AT`; depois dela, o backend usa `GROQ_FALLBACK_MODEL`. Antecipe a validação do fallback em staging para não haver interrupção em 17/07/2026.

Nunca use `VITE_GROQ_API_KEY`, `ARG` de Docker ou código do navegador. A chave publicada anteriormente deve ser revogada no painel da Groq e substituída. Em produção, injete a nova chave pelo secret manager da plataforma; não a grave em `.env.prod`, histórico Git, logs ou documentação.

O tutor envia à Groq apenas a mensagem, as preferências pedagógicas escolhidas e o contexto da aula autorizado pela matrícula. O nome real não entra no prompt. As conversas ficam persistidas no PostgreSQL; defina retenção, base legal/consentimento e canal de exclusão conforme a política de privacidade da instituição antes de ativar o recurso para alunos.

## Sondas e operação

- frontend liveness: `GET /health/live`
- backend liveness: `GET /health/live`
- backend readiness: `GET /health/ready`
- broadcast liveness interno: `GET http://broadcast:8080/health/live`
- broadcast status público: `GET /api/broadcast/status`

`live` deve apenas confirmar que o processo responde. `ready` deve confirmar banco, migrações e dependências indispensáveis sem mascarar erros. Não use métricas como healthcheck.

Checklist antes do corte:

1. Rotacionar JWT, PostgreSQL, RTMP, loop e Groq; usar valores diferentes por ambiente.
2. Confirmar `TRUST_PROXY=1`, `COOKIE_SECURE=true` e TLS antes de liberar autenticação real.
3. Validar `docker compose ... config --quiet` e construir todas as imagens em CI.
4. Testar login, upload acima de 1 MB, HLS gravado, OBS, loop e expiração de sessão.
5. Restringir 1935, ativar TLS e verificar o IP real usado pelos rate limits.
6. Executar backup e restauração do PostgreSQL e do volume de uploads.
7. Monitorar 5xx, 401 de `on_publish`, fila de vídeo, disco, memória e reinícios.

## Limites atuais

O volume local permite operação em um único host Docker. Para múltiplos hosts/réplicas, migre originais e HLS gravado para storage S3/R2 privado com URLs assinadas; mantenha FFmpeg em workers dedicados e use rate limit distribuído. Migrações de banco devem ser executadas por um job único e versionado antes de escalar o backend.
