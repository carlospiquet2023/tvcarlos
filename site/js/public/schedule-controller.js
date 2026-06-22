import { clear, element, icon, requiredElement } from '../dom.js';
import { getYouTubeVideoId } from '../media-source.js';
import { fetchJson } from './request.js';
import { isOnDemand } from './state.js';

export function createScheduleController({ state, onSelectLinear, onSelectProgram }) {
    const list = requiredElement('schedule-list');
    const count = requiredElement('schedule-count');

    async function load() {
        try {
            const programs = await fetchJson('/api/grade');
            state.programs = Array.isArray(programs) ? programs : [];
        } catch (error) {
            state.programs = [];
            console.warn('Grade indisponível; o sinal linear permanece ativo.', error);
        }
        render();
    }

    function render() {
        clear(list);
        count.textContent = `${state.programs.length} ${state.programs.length === 1 ? 'vídeo' : 'vídeos'}`;
        count.classList.toggle('is-empty', state.programs.length === 0);
        list.append(createLinearItem());
        state.programs.forEach((program) => list.append(createProgramItem(program)));
        if (state.programs.length === 0) list.append(createEmptyState());
    }

    function createLinearItem() {
        const active = !isOnDemand(state);
        const item = element('button', {
            className: `schedule-item${active ? ' active' : ''}`,
            attributes: { type: 'button', 'aria-current': active ? 'true' : 'false' },
        });
        const live = state.isLiveOnline;
        const title = live ? state.branding.liveTitle : state.branding.loopTitle;
        const description = live ? state.branding.liveDescription : state.branding.loopDescription;
        const badge = element('span', {
            className: `schedule-time ${live ? 'schedule-time-live' : 'schedule-time-loop'}`,
            text: live ? 'AO VIVO' : 'NO AR',
        });
        const details = element('span', { className: 'schedule-details' });
        details.append(
            element('strong', { text: title }),
            element('span', { text: `${description}${active ? ' • Ativo no momento' : ' • Toque para assistir'}` }),
        );
        item.append(badge, details);
        item.addEventListener('click', onSelectLinear);
        return item;
    }

    function createProgramItem(program) {
        const youtube = Boolean(getYouTubeVideoId(program.video));
        const active = isOnDemand(state) && state.activeProgram?.video === program.video;
        const item = element('button', {
            className: `schedule-item${active ? ' active' : ''}`,
            attributes: { type: 'button', 'aria-current': active ? 'true' : 'false' },
        });
        const badge = element('span', {
            className: `schedule-time schedule-time-media${youtube ? ' schedule-time-youtube' : ''}`,
            title: youtube ? 'Vídeo do YouTube' : 'Vídeo sob demanda',
        });
        badge.append(icon(youtube ? 'fa-brands fa-youtube' : 'fa-solid fa-play'));
        const details = element('span', { className: 'schedule-details' });
        const description = program.description || program.desc || '';
        details.append(
            element('strong', { text: program.title }),
            element('span', { text: `${description}${active ? ' • Ativo no momento' : ''}` }),
        );
        item.append(badge, details);
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
