import { clear, element, requiredElement } from '../dom.js';
import { fetchJson } from './request.js';

export function createPartnerController() {
    const showcase = requiredElement('partner-showcase');
    const track = requiredElement('partner-carousel-track');

    async function load() {
        try {
            const partners = await fetchJson('/api/partners');
            render(Array.isArray(partners) ? partners : []);
        } catch (error) {
            render([]);
            console.warn('Parceiros indisponíveis.', error);
        }
    }

    function render(partners) {
        clear(track);
        const visible = partners.length > 0;
        showcase.classList.toggle('hidden', !visible);
        document.body.classList.toggle('has-partner-showcase', visible);
        if (!visible) return;
        track.style.setProperty('--partner-carousel-duration', `${Math.max(12, partners.length * 6)}s`);
        [...partners, ...partners].forEach((partner, index) => track.append(createSlide(partner, index, partners.length)));
    }

    function createSlide(partner, index, total) {
        const duplicate = index >= total;
        const slide = element('div', {
            className: 'partner-carousel-slide',
            attributes: {
                role: 'group', 'aria-roledescription': 'slide',
                'aria-label': `${(index % total) + 1} de ${total}: ${partner.name}`,
                ...(duplicate ? { 'aria-hidden': 'true' } : {}),
            },
        });
        const content = partner.destinationUrl
            ? element('a', { className: 'partner-carousel-link', attributes: { href: partner.destinationUrl, target: '_blank', rel: 'sponsored noopener noreferrer', 'aria-label': `Visitar ${partner.name}` } })
            : element('div', { className: 'partner-carousel-link' });
        const image = element('img', { attributes: { src: partner.logoUrl, alt: `Logo de ${partner.name}`, loading: 'lazy' } });
        image.addEventListener('error', () => image.replaceWith(element('strong', { text: partner.name })), { once: true });
        content.append(image, element('span', { text: partner.name }));
        slide.append(content);
        return slide;
    }

    return { load, render };
}
