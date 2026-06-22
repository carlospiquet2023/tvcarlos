import { clear, element } from './js/dom.js';
import './js/client-guard.js';

async function initializeNewsPage() {
    const list = document.getElementById('news-page-list');
    try {
        const [newsResponse, brandingResponse] = await Promise.all([fetch(`/api/news?t=${Date.now()}`), fetch(`/api/branding?t=${Date.now()}`)]);
        if (!newsResponse.ok) throw new Error('Falha ao carregar notícias.');
        const news = await newsResponse.json();
        clear(list);
        if (!news.length) list.append(element('article', { className: 'content-card', text: 'Nenhuma notícia publicada no momento.' }));
        news.forEach((item, index) => {
            const card = element('article', { className: 'content-card news-page-item' });
            card.append(element('span', { className: 'news-page-index', text: String(index + 1).padStart(2, '0') }), element('p', { text: item.text }));
            list.append(card);
        });
        if (brandingResponse.ok) {
            const branding = await brandingResponse.json();
            document.getElementById('page-company').textContent = branding.companyName || 'TV Carlos';
            document.getElementById('news-owner').textContent = branding.legalName || 'Carlos Antonio de Oliveira Piquet';
            if (branding.logoUrl) {
                const logo = document.getElementById('page-logo');
                logo.src = branding.logoUrl;
                logo.classList.remove('hidden');
            }
        }
    } catch (error) {
        clear(list);
        list.append(element('article', { className: 'content-card', text: error.message }));
    }
}

initializeNewsPage();
