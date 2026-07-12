# Matriz de responsividade

O sistema usa a largura do viewport, e não as polegadas físicas, como referência de layout.

## Viewports prioritários

| Prioridade | Viewport | Uso esperado |
|---|---:|---|
| P0 | 1366 × 768 | notebook escolar e administrativo comum |
| P0 | 1440 × 900 | notebook de trabalho |
| P0 | 1920 × 1080 | desktop padrão |
| P1 | 1024 × 768 | tablet horizontal e notebook pequeno |
| P1 | 768 × 1024 | tablet vertical |
| P1 | 390 × 844 | celular comum |
| P2 | 2560 × 1440 | monitor grande |

## Breakpoints oficiais

- até 480 px: celular pequeno;
- até 768 px: celular grande e tablet vertical;
- até 1024 px: tablet horizontal e notebook pequeno;
- até 1366 px: notebook comum;
- até 1440 px: desktop padrão;
- a partir de 1600 px: monitor grande.

Os breakpoints ficam centralizados em `frontend/src/responsive.css`, carregado depois dos estilos dos módulos. As páginas podem manter ajustes locais quando dependem de sua própria composição.

## Critérios de aceite

- ausência de rolagem horizontal na página;
- tabelas extensas rolam dentro do próprio componente;
- navegação administrativa vira faixa horizontal até 1024 px;
- modais cabem em `100dvh` e preservam rolagem interna;
- cards e formulários não ficam menores que o conteúdo;
- alvos interativos permanecem utilizáveis por toque;
- o layout de 1366 × 768 reduz espaços sem esconder ações essenciais;
- zoom de 200% continua permitindo navegação e conclusão das jornadas.
