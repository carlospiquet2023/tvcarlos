import { apiJson } from '../api-client.js';
import { byId, clear, element, icon } from '../dom.js';
import { ENDPOINTS } from './core.js';
import { renderEmpty } from './ui.js';

const ACTION_LABELS = Object.freeze({
    'news.created': 'Notícia publicada', 'news.updated': 'Notícia atualizada', 'news.deleted': 'Notícia removida', 'news.reordered': 'Notícias reordenadas',
    'program.created': 'Vídeo adicionado', 'program.updated': 'Vídeo atualizado', 'program.deleted': 'Vídeo removido', 'program.reordered': 'Vídeos reordenados',
    'partner.created': 'Parceiro adicionado', 'partner.updated': 'Parceiro atualizado', 'partner.deleted': 'Parceiro removido', 'partner.reordered': 'Parceiros reordenados',
    'header_link.created': 'Botão do menu adicionado', 'header_link.updated': 'Botão do menu atualizado', 'header_link.deleted': 'Botão do menu removido', 'header_link.reordered': 'Menu reordenado',
    'branding.updated': 'Marca e sinal atualizados', 'auth.login_succeeded': 'Acesso administrativo realizado',
    'auth.login_failed': 'Tentativa de acesso recusada', 'auth.logout': 'Sessão administrativa encerrada',
    'auth.credentials_changed': 'Credenciais administrativas alteradas',
});

export function createOperationsController() {
    async function loadAudit() {
        const logs = await apiJson(ENDPOINTS.audit);
        const container = byId('audit-list');
        if (!logs.length) return renderEmpty(container, 'Nenhuma atividade administrativa registrada.');
        clear(container);
        logs.forEach((log) => {
            const copy = element('div');
            copy.append(element('strong', { text: ACTION_LABELS[log.action] || log.action }), element('span', { text: `${log.targetType}${log.ip ? ` · IP ${log.ip}` : ''}` }));
            const row = element('div', { className: 'audit-row' });
            row.append(icon('fa-solid fa-clock-rotate-left'), copy, element('time', { text: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(log.createdAt)) }));
            container.append(row);
        });
    }

    async function checkStatus() {
        const [api, streams, branding] = await Promise.all([probe('/api/health/ready'), streamStatus(), liveBranding()]);
        setStatus('api-status', api ? 'Saudável' : 'Indisponível', api ? 'online' : 'offline');
        if (branding?.liveSource === 'youtube' && branding.liveYoutubeUrl) {
            setStatus('stream-status', 'YouTube Live', 'online');
        } else {
            setStatus('stream-status', streams.live ? 'OBS ao vivo' : 'OBS em espera', streams.live ? 'online' : 'neutral');
        }
        setStatus('loop-status', streams.loop ? 'Operacional' : 'Indisponível', streams.loop ? 'online' : 'offline');
    }

    async function probe(url) {
        try { return (await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })).ok; }
        catch { return false; }
    }

    async function streamStatus() {
        try {
            const response = await fetch(`/api/stream/status?t=${Date.now()}`, { cache: 'no-store' });
            return response.ok ? response.json() : { live: false, loop: false };
        } catch {
            return { live: false, loop: false };
        }
    }

    async function liveBranding() {
        try { return await apiJson(ENDPOINTS.branding); }
        catch { return null; }
    }

    function setStatus(id, label, mode) {
        const target = byId(id);
        target.textContent = label;
        target.className = `status-pill ${mode}`;
    }

    return { loadAudit, checkStatus };
}
