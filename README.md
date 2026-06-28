# TV Carlos

Plataforma de TV linear, live RTMP/HLS, VOD local, YouTube, Sala Privada com interação moderada, material PDF/slide e Espaço do Professor. A versão 3 usa API TypeScript/Fastify, PostgreSQL, sessão segura em cookie, validação de mídia, Docker/Nginx e storage local ou Cloudflare R2.

## Desenvolvimento local

Pré-requisitos: Docker Desktop com Compose v2.

1. Copie `.env.example` para `.env`.
2. Gere dois tokens com `openssl rand -hex 32` e preencha `RTMP_STREAM_KEY` e `LOOP_STREAM_KEY`.
3. Defina senhas exclusivas em `POSTGRES_PASSWORD`, `DATABASE_URL` e `ADMIN_INITIAL_PASSWORD`.
4. Execute `docker compose up --build -d`.
5. Abra `http://localhost:8082` e acesse `/login.html` para administrar.

Na grade lateral, o painel aceita vídeos enviados, URLs HTTPS diretas e URLs válidas do YouTube (`watch`, `youtu.be`, Shorts e Live). Referências do YouTube são convertidas para embed em `youtube-nocookie.com`, isoladas do player HLS e cobertas por controles próprios da plataforma.

Cada Sala Privada pode ter player próprio, material de apoio à direita do vídeo, botão de mostrar/ocultar, tela cheia, página atual do PDF sincronizada pelo admin/professor e aba "Perguntas e Comentários" com moderação. O admin principal cria professores convidados em "Professores"; eles entram em `/professor.html` e só operam as salas atribuídas.

O primeiro boot cria o usuário de `ADMIN_INITIAL_USERNAME`. Depois de entrar e trocar a credencial no painel, remova `ADMIN_INITIAL_PASSWORD` do ambiente; o banco passa a ser a fonte de verdade.

## Comandos de qualidade

```powershell
npm ci
npm ci --prefix api
npx playwright install chromium
npm run quality
```

Também é possível executar as camadas separadamente:

```powershell
npm run lint
npm run typecheck
npm run test:api
npm run test:e2e
```

O gate exige cobertura mínima no núcleo da API e regressão real em Chromium desktop/celular. O workflow de CI executa o mesmo processo em uma instalação Docker isolada.

Para somente a API:

```powershell
cd api
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Produção

- Termine TLS 1.3 em um load balancer/reverse proxy e configure `APP_ORIGIN` com a origem HTTPS exata e `COOKIE_SECURE=true`.
- Não publique PostgreSQL nem a API diretamente. O Compose só expõe a borda Nginx.
- A porta RTMP está vinculada a `127.0.0.1` por padrão. Para OBS remoto, prefira VPN/overlay privado ou um ingress RTMPS autenticado; não abra 1935 indiscriminadamente.
- Armazene segredos em Docker/Kubernetes Secrets ou secret manager, não em `.env` versionado.
- Faça backup dos volumes `postgres-data`, `video-data`, `image-data` e `document-data`; teste a restauração.
- Para múltiplas réplicas, use Cloudflare R2/S3-compatible, CDN e rate limit/sessão externos.
- O dashboard do admin principal consulta API, PostgreSQL, storage, R2, Railway/Docker, sessão e HLS. Alertas e recuperações entram no log operacional.

### Railway

O deploy do Railway usa `railway.toml` e `deploy/railway/Dockerfile`. PostgreSQL fica em um serviço gerenciado separado; Nginx/RTMP, API e o loop FFmpeg compartilham uma única unidade de execução. Uploads usam `/data/images`, `/data/videos` e `/data/documents` quando R2 não está configurado.

Variáveis obrigatórias no serviço: `DATABASE_URL`, `RTMP_STREAM_KEY`, `LOOP_STREAM_KEY`, `ADMIN_INITIAL_PASSWORD`, `COOKIE_SECURE=true`, `DOCUMENT_STORAGE_DIR=/data/documents` e `RAILWAY_RUN_UID=0`. Para Cloudflare R2, preencha `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` e `R2_PUBLIC_URL`. O domínio HTTPS fornecido pela plataforma alimenta `APP_ORIGIN` automaticamente. Para o OBS, configure também um TCP Proxy apontando para a porta interna `1935`.

Consulte o procedimento completo em [Deploy no Railway](docs/DEPLOY_RAILWAY.md).

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Apresentação comercial](apresentacao.md)
- [Decisão arquitetural](docs/adr/0001-modular-monolith.md)
- [Contrato OpenAPI](docs/openapi.yaml)
- [Operação, backup e incidentes](docs/OPERATIONS.md)
- [Estratégia de testes](docs/TESTING.md)
- [Modelo de ameaças](docs/SECURITY.md)
- [Deploy no Railway](docs/DEPLOY_RAILWAY.md)
