# Deploy no Railway — substituição do tv-carlos

## Topologia preservada

- Serviço web: `tv-carlos-web`, construído pelo `Dockerfile` da raiz.
- PostgreSQL: serviço gerenciado existente, via `DATABASE_URL` privada.
- Volume persistente existente: manter montado em `/data`.
- Mídia local: `/data/images`, `/data/videos`, `/data/documents` e `/data/hls`.

O banco antigo usa tabelas minúsculas e permanece preservado. A plataforma nova cria tabelas Prisma com nomes próprios e não deve apagar o legado no primeiro corte. A migração ou descarte dos dados antigos é uma decisão posterior, após backup e conferência.

## Variáveis obrigatórias no serviço web

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<segredo aleatório com 48 bytes ou mais>
TRUST_PROXY=1
COOKIE_SECURE=true
RTMP_STREAM_KEY=<segredo aleatório>
LOOP_STREAM_KEY=<segredo aleatório diferente>
ADMIN_INITIAL_EMAIL=<email do administrador>
ADMIN_INITIAL_USERNAME=<login do administrador>
ADMIN_INITIAL_PASSWORD=<12+ caracteres, maiúscula, minúscula, número e símbolo>
ADMIN_INITIAL_NAME=<nome do administrador>
SEED_ON_START=true
```

`FRONTEND_URL` é derivada automaticamente de `RAILWAY_PUBLIC_DOMAIN`. Defina-a explicitamente apenas quando usar domínio próprio. Após o primeiro login confirmado, `SEED_ON_START` pode voltar a `false`; o seed é idempotente e nunca redefine senha existente.

## Inicialização segura

O entrypoint:

1. valida banco, JWT, origem e chave RTMP;
2. reaproveita o volume `/data`;
3. executa `prisma migrate deploy` com tentativas limitadas;
4. cria o administrador inicial quando autorizado;
5. valida o Nginx e inicia API + gateway;
6. só fica saudável quando `/health/ready` confirma o PostgreSQL.

## Corte e rollback

Antes do corte, crie snapshot/backup do PostgreSQL e do volume. O commit anterior do repositório deve permanecer em uma branch `legacy-tv-carlos-*`. Para rollback, selecione essa branch no Railway ou reverta o commit de substituição, sem excluir as tabelas novas ou o volume.

Após o deploy, validar: readiness, login do administrador, troca de senha, criação de instituição, upload de imagem/PDF, criação de turma, portal da família e transmissão OBS. A porta TCP 1935 deve continuar restrita ao operador sempre que possível.
