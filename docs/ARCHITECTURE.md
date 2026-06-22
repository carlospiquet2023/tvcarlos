# Arquitetura da TV Carlos

## Decisão

O sistema é um **monólito modular**. O domínio ainda não justifica a complexidade operacional de microserviços, mas as fronteiras internas são explícitas e testáveis.

```text
Browser -> Nginx (TLS/headers/static/HLS/VOD) -> API Fastify
                                                  |
                         +------------------------+------------------+
                         |                        |                  |
                    Casos de uso          Repositórios (ports)  Storage (port)
                         |                        |                  |
                      Domínio             PostgreSQL adapter   Local/S3 adapter
```

## Fronteiras

- `domain`: entidades, tipos e regras sem dependência de framework.
- `application`: casos de uso e contratos (`ports`) de persistência/storage.
- `infrastructure`: PostgreSQL, filesystem, hashing e integrações.
- `http`: rotas, autenticação, cookies, validação e tradução de erros.
- `config`: configuração tipada e validada no boot.

O banco padrão é PostgreSQL. A aplicação não espalha SQL pelo domínio: outro banco de cliente exige somente um adapter dos contratos de repositório e suas migrations. “Qualquer banco” não é tratado como compatibilidade mágica; diferenças de transação, locking e tipos continuam sendo validadas no adapter.

Uploads usam um contrato de storage. O adapter local atende uma instalação única; produção distribuída deve usar um adapter S3-compatible, CDN e upload direto com URL assinada. Metadados ficam no banco, e binários nunca ficam no banco.

## Dados e concorrência

- IDs UUID, sem índices posicionais na API.
- Escritas transacionais no banco.
- Sessões opacas persistidas apenas como hash.
- Auditoria de operações administrativas.
- Migração automática e idempotente no boot.
- Bootstrap seguro: instalação nova exige senha inicial forte por variável de ambiente.

## Central administrativa

O painel é uma camada operacional sobre os casos de uso da API, sem acesso direto ao banco. Ele cobre identidade editorial, textos do sinal, vídeos próprios/YouTube, giro de notícias, parceiros comerciais, até quatro botões de navegação e credenciais. Notícias, vídeos, parceiros e botões possuem criação, edição, remoção e ordenação persistida; toda mutação exige sessão + CSRF e gera auditoria. O dashboard consulta saúde da API, disponibilidade do HLS ao vivo e do loop 24h sem expor a chave RTMP.

Alterações de schema são incrementais. A migration `3` adiciona a navegação configurável e a identificação legal do titular sem apagar os dados existentes.

## Frontend

Os arquivos `app.js` e `admin.js` são somente composition roots. O site público separa estado, requisições, player, grade, identidade, parceiros, navegação e ticker em `site/js/public`. O painel separa recursos, uploads, identidade, segurança, operações e UI em `site/js/admin`. Não existe framework ou etapa de build no navegador: módulos ES nativos reduzem dependências e continuam protegidos por CSP.

O CSS público usa um manifesto (`style.css`) que compõe foundation, shell, player, grade, área comercial e responsividade. O painel e as páginas institucionais têm folhas isoladas para impedir cascatas acidentais entre contextos.

As decisões, o contrato e a execução estão em [ADR 0001](adr/0001-modular-monolith.md), [OpenAPI](openapi.yaml), [operação](OPERATIONS.md) e [testes](TESTING.md).

## Evolução esperada

1. Redis para rate limit/sessão somente quando houver múltiplas réplicas e necessidade comprovada.
2. S3/MinIO + fila de transcodificação/antivírus para mídia em escala.
3. CDN e URLs assinadas para conteúdo privado. CSS/JavaScript não impedem cópia de vídeo entregue ao navegador.
4. Observabilidade centralizada (OpenTelemetry, métricas e alertas) no ambiente de produção.
