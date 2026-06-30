(function initVLibras() {
    'use strict';

    var APP_URL = 'https://vlibras.gov.br/app';
    var SCRIPT_SRC = APP_URL + '/vlibras-plugin.js';
    var STYLE_ID = 'vlibras-widget-overrides';

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = 'div[vw], div[vw] .vw-access-button { z-index: 2147483647 !important; }';
        document.head.appendChild(style);
    }

    function ensureMarkup() {
        if (document.querySelector('div[vw]')) return;

        var widget = document.createElement('div');
        widget.setAttribute('vw', '');
        widget.className = 'enabled';
        widget.style.cssText = 'display:block !important; position:fixed !important; right:0 !important; top:50% !important; z-index:999999 !important; min-width: 50px; min-height: 50px; border: 2px solid red; background: rgba(255,0,0,0.2);';
        widget.innerHTML = [
            '<div vw-access-button class="active"></div>',
            '<div vw-plugin-wrapper>',
            '<div class="vw-plugin-top-wrapper"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(widget);
    }

    function showDebugError(msg) {
        console.warn(msg);
        var errBox = document.createElement('div');
        errBox.style = 'position:fixed;bottom:10px;left:10px;background:red;color:white;padding:10px;z-index:999999;border-radius:4px;';
        errBox.innerText = 'VLibras Error: ' + msg;
        document.body.appendChild(errBox);
    }

    function createWidget() {
        if (!window.VLibras || !window.VLibras.Widget) {
            showDebugError('window.VLibras.Widget is undefined after script load.');
            return;
        }

        try {
            new window.VLibras.Widget(APP_URL);
        } catch (e) {
            showDebugError(e.message);
        }
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
        script.onload = createWidget;
        script.onerror = function () {
            showDebugError('Failed to load plugin script from ' + SCRIPT_SRC);
        };
        document.body.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlugin, { once: true });
    } else {
        loadPlugin();
    }
})();
