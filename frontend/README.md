# EduVault Frontend

## Stack
- **React 19** + **TypeScript** + **Vite**
- **CSS puro** (vanilla, glassmorphism, CSS variables dinâmicas para branding)
- **Axios** para chamadas à API
- **video.js** + **HLS.js** para player de vídeo seguro
- **DOMPurify** para sanitização de conteúdo HTML
- **lucide-react** para ícones
- **framer-motion** para animações (Login)
- **react-router-dom** para roteamento

## Páginas

| Página | Arquivo | Descrição |
|--------|---------|-----------|
| Login | `Login.tsx` | Tela de login (username ou e-mail) — logo e nome dinâmicos do branding |
| Dashboard Aluno | `StudentDashboard.tsx` | 3 seções: Continuar estudando, Em Andamento, Disponíveis + cards de aulas ao vivo multiplataforma |
| Aula | `LessonPage.tsx` | Vídeo HLS + toolbar + anotações + material rico — logo no header |
| Admin | `AdminDashboard.tsx` | CRUD completo + thumbnails + editor de conteúdo + branding + live classes com filtro por plataforma e template de convite |

## Aulas ao Vivo Multiplataforma
- Providers suportados: Google Meet, Microsoft Teams, Zoom, Jitsi Meet, Whereby e BigBlueButton.
- A API retorna campos canônicos de reunião: `provider`, `meetingJoinUrl`, `meetingHostUrl`, `meetingCode`.
- O Admin tem filtro por plataforma e ação de copiar template de convite por aula (`invitationTemplate`).

## Contexts

| Context | Arquivo | Descrição |
|---------|---------|-----------|
| AuthContext | `AuthContext.tsx` | Estado global de autenticação (JWT + user + role) |
| ConfigContext | `ConfigContext.tsx` | Branding dinâmico: busca config pública, calcula e aplica 7 CSS vars |

## Sistema de Branding (ConfigContext)
O `ConfigContext` é o coração do tema dinâmico:
1. Busca `GET /api/config/public` ao carregar (sem auth, funciona no Login)
2. Converte `primaryColor` hex → RGB
3. Calcula: `--primary`, `--primary-hover` (darken), `--primary-glow` (alpha), `--primary-soft`, `--primary-light` (lighten), `--accent-pink`
4. Seta todas as vars via `document.documentElement.style.setProperty`
5. Atualiza `document.title` com o nome da plataforma

## Comandos

```bash
npm install       # Instalar dependências
npm run dev       # Servidor de desenvolvimento (http://localhost:5173)
npm run build     # Build de produção
npx tsc --noEmit  # Verificação de tipos TypeScript
```

## Docker

O frontend em produção é empacotado via `frontend/Dockerfile` e servido por Nginx (`frontend/nginx.docker.conf`).

Na raiz do projeto:

```bash
docker compose up -d --build
```

No modo Docker, o frontend proxyfica `/api`, `/hls` e `/uploads` para o backend.

## Variáveis de Ambiente
Criar arquivo `.env` na raiz do frontend:
```
VITE_API_URL=http://localhost:4000
```

## Convenções CSS
- Student Dashboard: prefixo `sd-*`
- Lesson Page: prefixo `lp-*`
- Admin Dashboard: prefixo `admin-*`
- Design tokens: variáveis CSS dinâmicas em `:root` no `index.css` (sobrescritas pelo ConfigContext)
- Gradientes usam `var(--primary-light)` ao invés de cores hardcoded
