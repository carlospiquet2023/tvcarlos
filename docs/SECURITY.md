# Modelo de ameaças e controles

## Riscos críticos encontrados no protótipo

- senha administrativa padrão e PBKDF2 com apenas 1.000 iterações;
- token bearer em `localStorage`, exposto a XSS;
- HTML criado com dados administrativos não escapados;
- CORS aberto e ausência de proteção CSRF/rate limit;
- sessão somente em memória e sem logout no servidor;
- upload confiando no MIME enviado pelo cliente e mantendo extensão arbitrária;
- RTMP aberto, aceitando publicação sem chave validada;
- segredo e dependências instaladas diretamente de volume em runtime;
- JSON como banco, com race condition, perda de escrita e nenhuma transação;
- ausência de TLS, CSP, logs estruturados, health checks e auditoria.

## Controles implementados

- Argon2id; hashes legados fracos não são aceitos porque a instalação é nova;
- sessão aleatória em cookie `HttpOnly`, `SameSite=Strict`, persistida como SHA-256;
- token CSRF e validação estrita de `Origin` em métodos mutáveis;
- rate limit global e específico para autenticação;
- validação Zod com limites de tamanho e rejeição de campos inesperados;
- detecção de arquivo por assinatura, nomes UUID e reprocessamento seguro de imagens;
- inspeção de vídeo por `ffprobe`, limites de bytes e diretórios sem execução;
- headers HTTP, CSP, proteção contra MIME sniffing e política de permissões;
- usuário sem credencial padrão em instalação nova;
- logs JSON com request ID, trilha de auditoria e respostas sem stack trace;
- imagens Docker construídas de forma reproduzível com `npm ci`.
- embeds limitados ao player `youtube-nocookie.com`, com CSP dedicada, validação de ID e camada de interação própria;
- links comerciais de parceiros restritos a HTTPS e abertos com `noopener`, `noreferrer` e relação `sponsored`;
- histórico administrativo visível somente para sessão autenticada;
- bloqueio de F12, atalhos comuns de ferramentas de desenvolvimento e menu de contexto como redução de abuso casual.
- log de acesso RTMP desativado no proxy para impedir que chaves de publicação apareçam em texto puro; a API registra somente o evento de autorização sem persistir o segredo.

## Limites honestos

Nenhum sistema pode prometer “segurança absoluta”. TLS válido, rotação de segredo, backup testado, WAF/CDN, atualizações, monitoramento, segredo de publicação RTMP e permissões do host são responsabilidades do ambiente. Bloqueios de F12, menu de contexto e overlays podem ser contornados e são apenas atrito contra uso casual. Vídeo reproduzível pelo cliente pode ser gravado; para conteúdo premium, use DRM e contratos de licença apropriados.
