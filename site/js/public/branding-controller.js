import { element, icon } from '../dom.js';
import { DEFAULT_BRANDING } from './config.js';
import { fetchJson } from './request.js';

export function createBrandingController({ state, onBrandingChange }) {
    async function load() {
        try {
            state.branding = { ...DEFAULT_BRANDING, ...await fetchJson('/api/branding') };
        } catch (error) {
            state.branding = { ...DEFAULT_BRANDING };
            console.warn('Configuração de marca indisponível; usando valores seguros.', error);
        }
        render();
        onBrandingChange();
    }

    function render() {
        const branding = state.branding;
        renderCompanyName(branding.companyName);
        setText('header-tagline', branding.tagline);
        setText('schedule-title', branding.scheduleTitle);
        setText('ticker-label-text', branding.tickerLabel);
        setText('partner-showcase-label', branding.partnerLabel);
        setText('legal-owner-name', branding.legalName);
        setText('player-watermark', branding.watermarkText);
        renderBackground(branding.backgroundUrl);
        renderHeaderLogo(branding);
        renderPlayerLogo(branding);
    }

    function renderCompanyName(companyName) {
        const target = document.getElementById('header-logo-text');
        if (!target) return;
        const [first, ...rest] = companyName.split(/\s+/);
        if (!rest.length) return target.replaceChildren(document.createTextNode(first));
        target.replaceChildren(document.createTextNode(`${first} `), element('span', { text: rest.join(' ') }));
    }

    function renderHeaderLogo(branding) {
        const target = document.getElementById('header-logo-icon');
        if (!target) return;
        if (!branding.logoUrl) {
            target.replaceChildren(icon('fa-solid fa-tv'));
            target.classList.remove('has-custom-logo');
            return;
        }
        const image = element('img', { className: 'brand-logo-image', attributes: { src: branding.logoUrl, alt: `Logo ${branding.companyName}` } });
        image.addEventListener('error', () => {
            target.replaceChildren(icon('fa-solid fa-tv'));
            target.classList.remove('has-custom-logo');
        }, { once: true });
        target.replaceChildren(image);
        target.classList.add('has-custom-logo');
    }

    function renderPlayerLogo(branding) {
        const image = document.getElementById('player-logo-img');
        const text = document.getElementById('player-logo-text');
        if (!image || !text) return;
        if (branding.logoUrl) {
            image.src = branding.logoUrl;
            image.alt = `Logo ${branding.companyName}`;
            image.classList.remove('hidden');
            text.classList.add('hidden');
        } else {
            image.classList.add('hidden');
            text.textContent = branding.logoText;
            text.classList.remove('hidden');
        }
    }

    function renderBackground(backgroundUrl) {
        const value = backgroundUrl?.trim();
        if (!value) {
            document.body.style.removeProperty('--site-background-image');
            return;
        }
        document.body.style.setProperty('--site-background-image', `url("${value.replace(/["\\]/g, '\\$&')}")`);
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    return { load, render };
}
