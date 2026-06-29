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

    // ── Criar barra de acessibilidade ──
    const bar = document.createElement('div');
    bar.className = 'a11y-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Ferramentas de acessibilidade');

    // Label
    const label = document.createElement('span');
    label.className = 'a11y-bar-label';
    label.innerHTML = '<i class="fa-solid fa-universal-access"></i> Acessibilidade';
    bar.appendChild(label);

    // Botão Alto Contraste
    const btnContrast = document.createElement('button');
    btnContrast.className = 'a11y-btn' + (root.classList.contains('a11y-high-contrast') ? ' active' : '');
    btnContrast.type = 'button';
    btnContrast.innerHTML = '<i class="fa-solid fa-circle-half-stroke"></i> Alto Contraste';
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
    btnFont.innerHTML = '<i class="fa-solid fa-font"></i> Fonte Legível';
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

    // ── Inserir barra no topo do body ──
    document.body.insertBefore(bar, document.body.firstChild);
})();
