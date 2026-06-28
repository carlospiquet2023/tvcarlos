# Apresentação do Sistema TV Carlos

## O que é

A TV Carlos é uma plataforma própria para transmissão, conteúdo sob demanda e salas privadas com interação moderada. Ela entrega site público, player, painel administrativo, área do professor convidado, upload de mídia, controle de acesso e monitoramento operacional em um único sistema.

## O que o sistema faz

- Web TV com transmissão ao vivo por OBS/RTMP/HLS.
- Programação automática 24h com vídeos enviados.
- Vídeos por upload, URL HTTPS ou YouTube.
- Painel administrativo principal com controle de marca, sinal, grade, notícias, parceiros, menus e credenciais.
- Sala Privada protegida por ID e senha.
- Player exclusivo por sala, com live, YouTube, vídeo enviado ou link externo.
- Material de apoio por sala: PDF, imagem, slide/link externo.
- Botão para mostrar/ocultar material e modo tela cheia.
- Controle de página atual do PDF pelo admin ou professor.
- Aba "Perguntas e Comentários" com moderação.
- Aprovar, ocultar, responder, destacar ou arquivar mensagens.
- Anti-spam e histórico salvo no banco.
- Espaço do Professor com usuário e senha próprios.
- Professor convidado só acessa as salas atribuídas.
- Upload de imagens, vídeos e documentos PDF.
- Parceiros comerciais e espaços patrocináveis.
- Dashboard de saúde do sistema no admin principal.
- Log operacional para equipe de manutenção.

## Para quem serve

- Aulas ao vivo e cursos fechados.
- Eventos privados.
- Reuniões com clientes.
- Entrevistas com perguntas selecionadas.
- Comunidades em torno de uma TV online.
- Conteúdo de patrocinadores.
- Canais locais, institucionais ou independentes.
- Treinamentos corporativos.

## Diferenciais

- Não é só um site com vídeo: é uma plataforma operacional.
- O admin principal mantém controle total.
- O professor convidado trabalha sem acesso ao painel principal.
- A Sala Privada aumenta valor percebido sem exigir videoconferência cara.
- PDF/slide sincronizado deixa a aula mais profissional.
- Interação moderada evita bagunça pública e reduz risco.
- Dashboard mostra quando API, banco, storage, R2, Railway/Docker ou HLS exigem atenção.
- Arquitetura preparada para Docker, Railway, PostgreSQL, Nginx/RTMP e Cloudflare R2.

## Infraestrutura

- Frontend estático servido por Nginx.
- Backend Fastify em TypeScript.
- PostgreSQL como banco principal.
- Docker para ambiente local e produção controlada.
- Railway como opção de deploy.
- Cloudflare R2 opcional para imagens, vídeos e documentos.
- RTMP/HLS para live via OBS.
- Cookies HttpOnly, CSRF, rate limit, validação de arquivo e auditoria.

## Valor comercial

O sistema permite vender ou operar:

- assinatura para acesso privado;
- aula ou evento fechado;
- pacote para professores convidados;
- espaço patrocinado;
- canal institucional;
- biblioteca de vídeos;
- comunidade com perguntas moderadas;
- transmissão ao vivo com material de apoio.

## Limites claros

O sistema protege acesso, moderação e operação, mas vídeo entregue ao navegador pode ser gravado pelo usuário. Para conteúdo premium com exigência antipirataria forte, é necessário DRM/CDN especializada e contrato de licença.

## Resumo

A TV Carlos é uma base pronta para transformar uma Web TV em produto: transmissão, conteúdo, sala privada, professor, interação, material de apoio, monetização e operação técnica visível no mesmo painel.
