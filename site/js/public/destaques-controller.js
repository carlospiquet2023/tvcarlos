import { clear, element } from '../dom.js';
import { fetchJson } from './request.js';
import { getYouTubeVideoId } from '../media-source.js';

export function createDestaquesController({ onSelectProgram }) {
    const track = document.querySelector('.destaques-track');
    const pagination = document.querySelector('.destaques-pagination');
    const container = document.querySelector('.destaques-section');

    async function load() {
        if (!track || !pagination) return;
        
        try {
            // Buscando os mesmos vídeos da grade
            const query = new URLSearchParams({ page: '1', limit: '10' });
            const result = await fetchJson(`/api/grade?${query.toString()}`);
            
            let programs = [];
            if (result && Array.isArray(result.items)) {
                programs = result.items;
            } else if (Array.isArray(result)) {
                programs = result;
            }
            
            // Só exibe se houver vídeos na grade
            if (programs.length > 0) {
                render(programs);
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        } catch (error) {
            console.warn('Destaques indisponíveis.', error);
            container.style.display = 'none';
        }
    }

    function render(programs) {
        clear(track);
        clear(pagination);
        
        // Pega no máximo os 5 primeiros programas para não encher o carrossel demais
        const destaques = programs.slice(0, 5);
        
        destaques.forEach((program, index) => {
            const card = createCard(program);
            track.append(card);
            
            // Cria os pontos de paginação (dots)
            const dot = element('span', { className: index === 0 ? 'dot active' : 'dot' });
            // Clique no dot rola até o card
            dot.addEventListener('click', () => {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            });
            pagination.append(dot);
        });
        
        // Lógica de interseção para atualizar os dots ativos quando o usuário rolar
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = Array.from(track.children).indexOf(entry.target);
                    const dots = pagination.querySelectorAll('.dot');
                    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
                }
            });
        }, {
            root: track,
            threshold: 0.6
        });
        
        Array.from(track.children).forEach(card => observer.observe(card));
    }

    function createCard(program) {
        const isYT = Boolean(getYouTubeVideoId(program.video));
        // Tenta pegar o poster ou um thumbnail generico se for youtube
        let posterUrl = program.poster;
        if (!posterUrl) {
            posterUrl = isYT ? `https://img.youtube.com/vi/${getYouTubeVideoId(program.video)}/maxresdefault.jpg` : 'assets/fundo-site.png';
        }
        
        const card = element('div', { className: 'destaque-card' });
        
        const img = element('img', { attributes: { src: posterUrl, alt: program.title, loading: 'lazy' } });
        
        const content = element('div', { className: 'destaque-card-content' });
        
        const title = element('h3', { text: program.title });
        const desc = element('p', { text: program.description || program.desc || 'Assista agora na TV Carlos.' });
        
        content.append(title, desc);
        card.append(img, content);
        
        card.addEventListener('click', () => onSelectProgram(program));
        return card;
    }

    return { load };
}
