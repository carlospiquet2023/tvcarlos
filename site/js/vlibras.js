(function initVLibras() {
    'use strict';

    var APP_URL = 'https://vlibras.gov.br/app';
    var SCRIPT_SRC = APP_URL + '/vlibras-plugin.js';
    var STYLE_ID = 'vlibras-widget-overrides';

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = 'div[vw], div[vw] [vw-access-button] { z-index: 2147483647 !important; }';
        document.head.appendChild(style);
    }

    function ensureMarkup() {
        if (document.querySelector('div[vw]')) return;

        var widget = document.createElement('div');
        widget.setAttribute('vw', '');
        widget.className = 'enabled';
        widget.innerHTML = [
            '<div vw-access-button class="active"></div>',
            '<div vw-plugin-wrapper>',
            '<div class="vw-plugin-top-wrapper"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(widget);
    }

    function createWidget() {
        if (!window.VLibras || !window.VLibras.Widget) {
            console.warn('VLibras nao carregou. Verifique a CSP, a conexao e bloqueadores de scripts.');
            return;
        }

        new window.VLibras.Widget(APP_URL);
    }

    function loadPlugin() {
        ensureStyle();
        ensureMarkup();

        if (window.VLibras && window.VLibras.Widget) {
            createWidget();
            return;
        }

        var existingScript = document.querySelector('script[src="' + SCRIPT_SRC + '"]');
        if (existingScript) {
            existingScript.addEventListener('load', createWidget, { once: true });
            return;
        }

        var script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = createWidget;
        script.onerror = function () {
            console.warn('Nao foi possivel carregar o plugin VLibras em ' + SCRIPT_SRC + '.');
        };
        document.body.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlugin, { once: true });
    } else {
        loadPlugin();
    }
})();
