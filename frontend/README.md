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
| Dashboard Aluno | `StudentDashboard.tsx` | 3 seções: Continuar estudando, Em Andamento, Disponíveis — logo dinâmico |
| Aula | `LessonPage.tsx` | Vídeo HLS + toolbar + anotações + material rico + fórum de comentários — logo no header |
| Admin | `AdminDashboard.tsx` | CRUD completo + thumbnails + editor de conteúdo + branding + moderação + punições + presença |

## Componentes

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| BlockEditor | `BlockEditor.tsx` | Editor de blocos drag-and-drop (texto, imagem, destaque) + 25 fontes + cor de fundo |
| ConfirmModal | `ConfirmModal.tsx` | Modal de confirmação elegante (substitui window.confirm) |
| ErrorBoundary | `ErrorBoundary.tsx` | Captura erros React globais com UI de recuperação |
| LessonComments | `LessonComments.tsx` | Fórum de comentários por aula: polling 5s, respostas aninhadas, denúncias, modal de violação, banner de ban, formulário de recurso |
| ProtectedRoute | `ProtectedRoute.tsx` | Guard de rotas: redireciona por role (admin/student) |
| VideoPlayer | `VideoPlayer.tsx` | Player video.js + HLS + watermark + progresso automático + heartbeat de presença (30s) |

## Contexts

| Context | Arquivo | Descrição |
|---------|---------|-----------|
| AuthContext | `AuthContext.tsx` | Estado global de autenticação (JWT + user + role) |
| ConfigContext | `ConfigContext.tsx` | Branding dinâmico: busca config pública, calcula e aplica 7 CSS vars + flag de presença |

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

## Variáveis de Ambiente
Criar arquivo `.env` na raiz do frontend:
```
VITE_API_URL=http://localhost:4000
```

## Convenções CSS
- Student Dashboard: prefixo `sd-*`
- Lesson Page: prefixo `lp-*`
- Admin Dashboard: prefixo `admin-*`
- Fórum/Comentários: prefixo `lc-*`
- Design tokens: variáveis CSS dinâmicas em `:root` no `index.css` (sobrescritas pelo ConfigContext)
- Gradientes usam `var(--primary-light)` ao invés de cores hardcoded
