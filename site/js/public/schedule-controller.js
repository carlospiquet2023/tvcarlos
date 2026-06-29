import { clear, element, icon, requiredElement } from '../dom.js';
import { getYouTubeVideoId } from '../media-source.js';
import { fetchJson } from './request.js';
import { isOnDemand } from './state.js';

export function createScheduleController({ state, onSelectLinear, onSelectProgram }) {
    const list = requiredElement('schedule-list');
    const count = document.getElementById('schedule-count');

    let currentPage = 1;
    let hasMore = false;
    let currentSearch = '';
    let currentCategory = '';
    let isFetching = false;

    const searchInput = document.getElementById('schedule-search');
    const categorySelect = document.getElementById('schedule-category');

    async function loadCategories() {
        try {
            const categories = await fetchJson('/api/categories');
            if (categories && categories.length > 0) {
                const currentVal = categorySelect.value;
                categorySelect.innerHTML = '<option value="">Todas as categorias</option>';
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.append(option);
                });
                categorySelect.value = currentVal;
            }
        } catch (e) {
            console.warn('Falha ao carregar categorias', e);
        }
    }

    async function load(reset = true) {
        if (isFetching) return;
        isFetching = true;
        if (reset) {
            currentPage = 1;
            state.programs = [];
        }
        try {
            const query = new URLSearchParams();
            query.set('page', currentPage.toString());
            query.set('limit', '50');
            if (currentSearch) query.set('search', currentSearch);
            if (currentCategory) query.set('category', currentCategory);

            const result = await fetchJson(`/api/grade?${query.toString()}`);
            if (result && Array.isArray(result.items)) {
                if (reset) state.programs = result.items;
                else state.programs.push(...result.items);
                hasMore = state.programs.length < result.total;
            } else if (Array.isArray(result)) {
                // Backward compatibility
                state.programs = result;
                hasMore = false;
            } else {
                state.programs = [];
                hasMore = false;
            }
        } catch (error) {
            if (reset) state.programs = [];
            console.warn('Grade indisponível; o sinal linear permanece ativo.', error);
        } finally {
            isFetching = false;
        }
        render();
        if (reset) loadCategories();
    }

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentSearch = e.target.value.trim();
                load(true);
            }, 300);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            currentCategory = e.target.value;
            load(true);
        });
    }

    function render() {
        clear(list);
        
        if (count) {
            count.textContent = `${state.programs.length} ${state.programs.length === 1 ? 'vídeo' : 'vídeos'}`;
        }
        
        if (!currentSearch && !currentCategory) {
            list.append(createLinearItem());
        }
        
        state.programs.forEach((program) => list.append(createProgramItem(program)));
        
        if (state.programs.length === 0) {
            list.append(createEmptyState());
        } else if (hasMore) {
            const loadMoreBtn = element('button', {
                className: 'schedule-item',
                attributes: { type: 'button' },
            });
            const details = element('span', { className: 'schedule-details', style: 'text-align: center; width: 100%' });
            details.append(element('strong', { text: 'Carregar mais vídeos' }));
            loadMoreBtn.append(details);
            loadMoreBtn.addEventListener('click', () => {
                currentPage++;
                load(false);
            });
            list.append(loadMoreBtn);
        }
    }

    function createLinearItem() {
        const active = !isOnDemand(state);
        const item = element('div', {
            className: `schedule-item${active ? ' active' : ''}`,
            attributes: { role: 'button', tabindex: '0', 'aria-current': active ? 'true' : 'false' },
        });
        const live = state.isLiveOnline;
        const title = live ? state.branding.liveTitle : state.branding.loopTitle;
        const description = live ? state.branding.liveDescription : state.branding.loopDescription;
        
        const iconContainer = element('div', { className: 'schedule-icon-container' });
        if (live) {
            const iconEl = element('div', { className: 'schedule-icon-agora', text: 'AGORA' });
            iconContainer.append(iconEl);
        } else {
            const iconEl = element('i', { className: 'fa-solid fa-broadcast-tower' });
            iconContainer.append(iconEl);
        }

        const details = element('div', { className: 'schedule-details' });
        const timeText = element('span', { className: 'schedule-time-text', text: 'Ao Vivo' });
        const titleEl = element('strong', { text: title });
        const descEl = element('span', { text: `${description}${active ? ' • Ativo no momento' : ' • Toque para assistir'}` });
        
        details.append(timeText, titleEl, descEl);
        item.append(iconContainer, details);
        item.addEventListener('click', onSelectLinear);
        return item;
    }

    function createProgramItem(program) {
        const youtube = Boolean(getYouTubeVideoId(program.video));
        const active = isOnDemand(state) && state.activeProgram?.video === program.video;
        const item = element('div', {
            className: `schedule-item${active ? ' active' : ''}`,
            attributes: { role: 'button', tabindex: '0', 'aria-current': active ? 'true' : 'false' },
        });
        
        const iconContainer = element('div', { className: 'schedule-icon-container' });
        const iconEl = element('i', { className: youtube ? 'fa-brands fa-youtube' : 'fa-solid fa-play' });
        if (youtube) iconEl.style.color = 'var(--youtube)';
        iconContainer.append(iconEl);

        const details = element('div', { className: 'schedule-details' });
        const timeText = element('span', { className: 'schedule-time-text', text: 'Gravado' });
        const description = program.description || program.desc || '';
        const titleEl = element('strong', { text: program.title });
        const descEl = element('span', { text: `${description}${active ? ' • Assistindo agora' : ''}` });
        
        details.append(timeText, titleEl, descEl);
        item.append(iconContainer, details);
        item.addEventListener('click', () => onSelectProgram(program));
        return item;
    }

    function createEmptyState() {
        const empty = element('div', { className: 'schedule-empty' });
        empty.append(icon('fa-regular fa-clock'), element('strong', { text: 'Mais conteúdos em breve' }), element('p', { text: 'Acompanhe o sinal contínuo.' }));
        return empty;
    }

    return { load, render };
}
