import { clear, element, requiredElement } from '../dom.js';
import { fetchJson } from './request.js';

export function createNavigationController() {
    const desktop = requiredElement('header-links');
    const mobile = requiredElement('mobile-header-links');
    const button = requiredElement('menu-toggle');
    const menu = requiredElement('mobile-menu');
    const header = document.querySelector('.main-header');
    if (!header) throw new Error('Elemento obrigatório ausente: .main-header');

    async function load() {
        try {
            const links = await fetchJson('/api/header-links');
            render(Array.isArray(links) ? links.slice(0, 4) : []);
        } catch (error) {
            render([]);
            console.warn('Menu configurável indisponível.', error);
        }
    }

    function initialize() {
        button.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));
        menu.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
        document.addEventListener('click', (event) => { if (!header.contains(event.target)) setOpen(false); });
        window.matchMedia('(min-width: 861px)').addEventListener('change', () => setOpen(false));
    }

    function render(links) {
        clear(desktop);
        clear(mobile);
        links.forEach((link) => {
            desktop.append(createLink(link, 'header-nav-link'));
            mobile.append(createLink(link, 'mobile-nav-link'));
        });
    }

    function createLink(link, className) {
        const anchor = element('a', { className, text: link.name, attributes: { href: link.url } });
        try {
            if (new URL(link.url, location.href).origin !== location.origin) {
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
            }
        } catch { anchor.href = 'index.html'; }
        return anchor;
    }

    function setOpen(open) {
        menu.classList.toggle('hidden', !open);
        button.classList.toggle('is-open', open);
        header.classList.toggle('menu-open', open);
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }

    return { initialize, load, render };
}
