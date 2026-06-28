# Arquitetura da TV Carlos

## Decisão

O sistema é um **monólito modular**. O domínio ainda não justifica a complexidade operacional de microserviços, mas as fronteiras internas são explícitas e testáveis.

```text
Browser/Admin/Professor -> Nginx (TLS/headers/static/HLS/VOD/PDF) -> API Fastify
                                                  |
                          +------------------------+------------------+
                          |                        |                  |
                     Casos de uso          Repositórios (ports)  Storage (port)
                          |                        |                  |
                       Domínio             PostgreSQL adapter   Local/R2 adapter
```

## Fronteiras

- `domain`: entidades, tipos e regras sem dependência de framework.
- `application`: casos de uso e contratos (`ports`) de persistência/storage.
- `infrastructure`: PostgreSQL, filesystem, hashing e integrações.
- `http`: rotas, autenticação, cookies, validação e tradução de erros.
- `config`: configuração tipada e validada no boot.

O banco padrão é PostgreSQL. A aplicação não espalha SQL pelo domínio: outro banco de cliente exige somente um adapter dos contratos de repositório e suas migrations. “Qualquer banco” não é tratado como compatibilidade mágica; diferenças de transação, locking e tipos continuam sendo validadas no adapter.

Uploads usam um contrato de storage para imagens, vídeos e documentos PDF. O adapter local atende uma instalação única com volumes Docker/Railway; Cloudflare R2 usa o mesmo port para manter front/back sem lógica duplicada. Metadados ficam no banco, e binários nunca ficam no banco.

## Dados e concorrência

- IDs UUID, sem índices posicionais na API.
- Escritas transacionais no banco.
- Sessões opacas persistidas apenas como hash.
- Auditoria de operações administrativas.
- RBAC simples: `admin` opera tudo; `teacher` só opera salas privadas atribuídas.
- Sessões privadas por sala, também opacas e com expiração curta.
- Migração automática e idempotente no boot.
- Bootstrap seguro: instalação nova exige senha inicial forte por variável de ambiente.

## Central administrativa

O painel é uma camada operacional sobre os casos de uso da API, sem acesso direto ao banco. Ele cobre identidade editorial, textos do sinal, vídeos próprios/YouTube, giro de notícias, parceiros comerciais, até quatro botões de navegação, credenciais, professores, salas privadas, interação moderada e material PDF/slide. Toda mutação exige sessão + CSRF e gera auditoria.

O dashboard do admin principal agrega API, PostgreSQL, storage local/R2, ambiente Railway/Docker, sessão segura e HLS. Mudanças de estado relevantes são registradas como eventos operacionais para manutenção.

Alterações de schema são incrementais. A migration `3` adiciona a navegação configurável e a identificação legal do titular sem apagar os dados existentes.

## Frontend

Os arquivos `app.js`, `admin.js`, `private-room.js` e `professor.js` são composition roots. O site público separa estado, requisições, player, grade, identidade, parceiros, navegação e ticker em `site/js/public`. O painel separa recursos, uploads, identidade, segurança, professores, operações e UI em `site/js/admin`. A Sala Privada renderiza player, material de apoio e interação moderada; o Espaço do Professor expõe apenas salas atribuídas. Não existe framework ou etapa de build no navegador: módulos ES nativos reduzem dependências e continuam protegidos por CSP.

O CSS público usa um manifesto (`style.css`) que compõe foundation, shell, player, grade, área comercial e responsividade. O painel e as páginas institucionais têm folhas isoladas para impedir cascatas acidentais entre contextos.

As decisões, o contrato e a execução estão em [ADR 0001](adr/0001-modular-monolith.md), [OpenAPI](openapi.yaml), [operação](OPERATIONS.md) e [testes](TESTING.md).

## Evolução esperada

1. Redis para rate limit/sessão somente quando houver múltiplas réplicas e necessidade comprovada.
2. Fila de transcodificação/antivírus para mídia em escala.
3. CDN e URLs assinadas para conteúdo privado. CSS/JavaScript não impedem cópia de vídeo entregue ao navegador.
4. Observabilidade centralizada (OpenTelemetry, métricas e alertas) no ambiente de produção.
