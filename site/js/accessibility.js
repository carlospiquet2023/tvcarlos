/**
 * Acessibilidade – Alto Contraste + Fonte Legível + VLibras
 * Salva preferências no localStorage para persistir entre sessões.
 * Compatível com eMAG (Modelo de Acessibilidade em Governo Eletrônico).
 */
(function initAccessibility() {
    'use strict';

    const KEYS = {
        contrast: 'tvcarlos_a11y_contrast',
        font: 'tvcarlos_a11y_font',
    };

    const root = document.documentElement;

    // ── Restaurar preferências salvas ──
    if (localStorage.getItem(KEYS.contrast) === '1') {
        root.classList.add('a11y-high-contrast');
    }
    if (localStorage.getItem(KEYS.font) === '1') {
        root.classList.add('a11y-readable-font');
    }

    // ── Criar container principal ──
    const widget = document.createElement('div');
    widget.className = 'a11y-widget';
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', 'Menu de acessibilidade');

    // Botão de abrir/fechar
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'a11y-toggle';
    toggleBtn.type = 'button';
    toggleBtn.innerHTML = '<i class="fa-solid fa-universal-access"></i>';
    toggleBtn.title = 'Abrir ferramentas de acessibilidade';
    toggleBtn.addEventListener('click', () => {
        widget.classList.toggle('open');
    });
    widget.appendChild(toggleBtn);

    // ── Criar barra de acessibilidade (menu interno) ──
    const bar = document.createElement('div');
    bar.className = 'a11y-menu';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Ferramentas de acessibilidade');

    // Botão Alto Contraste
    const btnContrast = document.createElement('button');
    btnContrast.className = 'a11y-btn' + (root.classList.contains('a11y-high-contrast') ? ' active' : '');
    btnContrast.type = 'button';
    btnContrast.innerHTML = '<i class="fa-solid fa-circle-half-stroke"></i>';
    btnContrast.setAttribute('aria-pressed', root.classList.contains('a11y-high-contrast') ? 'true' : 'false');
    btnContrast.title = 'Ativar/desativar modo alto contraste (preto e amarelo)';
    btnContrast.addEventListener('click', function () {
        root.classList.toggle('a11y-high-contrast');
        const active = root.classList.contains('a11y-high-contrast');
        localStorage.setItem(KEYS.contrast, active ? '1' : '0');
        btnContrast.classList.toggle('active', active);
        btnContrast.setAttribute('aria-pressed', String(active));
    });
    bar.appendChild(btnContrast);

    // Botão Fonte Acessível
    const btnFont = document.createElement('button');
    btnFont.className = 'a11y-btn' + (root.classList.contains('a11y-readable-font') ? ' active' : '');
    btnFont.type = 'button';
    btnFont.innerHTML = '<i class="fa-solid fa-font"></i>';
    btnFont.setAttribute('aria-pressed', root.classList.contains('a11y-readable-font') ? 'true' : 'false');
    btnFont.title = 'Ativar/desativar fonte de alta legibilidade (Atkinson Hyperlegible)';
    btnFont.addEventListener('click', function () {
        root.classList.toggle('a11y-readable-font');
        const active = root.classList.contains('a11y-readable-font');
        localStorage.setItem(KEYS.font, active ? '1' : '0');
        btnFont.classList.toggle('active', active);
        btnFont.setAttribute('aria-pressed', String(active));
    });
    bar.appendChild(btnFont);

    widget.appendChild(bar);

    // ── Inserir widget no topo do body ──
    document.body.insertBefore(widget, document.body.firstChild);
})();
