# Deploy no Railway

## Topologia

- `tv-carlos-web`: frontend estático, Nginx/RTMP, API Fastify e loop FFmpeg.
- `Postgres`: banco gerenciado, acessado apenas pela rede privada.
- volume persistente do serviço web montado em `/data`: imagens e vídeos enviados.
- domínio HTTPS do Railway: site, painel, API, HLS e VOD.
- TCP Proxy na porta interna `1935`: entrada RTMP do OBS.

Esta composição é deliberadamente de uma única réplica: Railway não compartilha um volume entre serviços ou réplicas. Para escalar horizontalmente, mova mídia para storage S3-compatible e coordenação/sessões para serviços externos.

## Variáveis do serviço web

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
COOKIE_SECURE=true
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=<segredo com no mínimo 14 caracteres>
RTMP_STREAM_KEY=<segredo aleatório de 32 bytes ou mais>
LOOP_STREAM_KEY=<segredo aleatório diferente>
RAILWAY_RUN_UID=0
```

`APP_ORIGIN` é derivado de `RAILWAY_PUBLIC_DOMAIN` no entrypoint. Em domínio próprio, defina `APP_ORIGIN` explicitamente com a origem HTTPS exata.

## Publicação

1. Conecte o repositório GitHub ao serviço `tv-carlos-web`.
2. Adicione PostgreSQL ao mesmo projeto.
3. Anexe um volume ao serviço web em `/data`.
4. Configure as variáveis sem versionar valores secretos.
5. Gere um domínio HTTP público.
6. Crie um TCP Proxy para a porta interna `1935`.
7. Aguarde `/api/health/ready` responder `200`.

No OBS, use o domínio e a porta fornecidos pelo TCP Proxy no formato `rtmp://DOMINIO:PORTA/live`, com a chave configurada em `RTMP_STREAM_KEY`.

## Operação

- Faça backup independente do PostgreSQL e do volume `/data`.
- Nunca reutilize `RTMP_STREAM_KEY` e `LOOP_STREAM_KEY`.
- Rotacione a chave do OBS após qualquer suspeita de exposição.
- Valide `/api/health/ready`, `/api/stream/status` e `/hls/loop.m3u8` após cada deploy.
- O volume implica pequena indisponibilidade durante redeploy e impede múltiplas réplicas nesta topologia.
