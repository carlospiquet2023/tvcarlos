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
    'private_room.created': 'Sala privada criada', 'private_room.updated': 'Sala privada atualizada', 'private_room.deleted': 'Sala privada removida', 'private_room.password_rotated': 'Senha da sala privada renovada',
    'private_room.material_updated': 'Material da sala atualizado',
    'private_room_interaction.settings_updated': 'Interação da sala atualizada', 'private_room_interaction.message_moderated': 'Mensagem moderada', 'private_room_interaction.history_archived': 'Histórico da sala arquivado',
    'teacher.created': 'Professor criado', 'teacher.rooms_updated': 'Acesso do professor atualizado', 'teacher.password_rotated': 'Senha do professor renovada', 'teacher.deleted': 'Professor removido',
    'operations.service_degraded': 'Alerta operacional detectado', 'operations.service_recovered': 'Serviço recuperado',
});

const STATUS_LABELS = Object.freeze({ ok: 'OK', warning: 'Atenção', error: 'Falha', neutral: 'Info' });
const STATUS_CLASS = Object.freeze({ ok: 'online', warning: 'warning', error: 'offline', neutral: 'neutral' });
const SERVICE_ICONS = Object.freeze({
    api: 'fa-solid fa-server',
    database: 'fa-solid fa-database',
    storage: 'fa-solid fa-hard-drive',
    'cloudflare-r2': 'fa-solid fa-cloud',
    runtime: 'fa-solid fa-network-wired',
    security: 'fa-solid fa-shield-halved',
    'stream-live': 'fa-solid fa-satellite-dish',
    'stream-loop': 'fa-solid fa-repeat',
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
        const [operationsResult, streamsResult, brandingResult] = await Promise.allSettled([
            apiJson('/api/operations/status'),
            streamStatus(),
            liveBranding(),
        ]);
        const operations = operationsResult.status === 'fulfilled' ? operationsResult.value : null;
        const streams = streamsResult.status === 'fulfilled' ? streamsResult.value : { live: false, loop: false };
        const branding = brandingResult.status === 'fulfilled' ? brandingResult.value : null;
        const apiOk = operationsResult.status === 'fulfilled';
        const streamServices = streamHealth(streams, branding);
        const services = [
            ...(operations?.services || fallbackServices(apiOk)),
            ...streamServices,
        ];

        renderOperations(services);
        renderOperationalLog(services, operations?.logs || []);
        renderSummary(services);

        const database = services.find((service) => service.id === 'database');
        setStatus('api-status', apiOk && database?.status !== 'error' ? 'Saudável' : 'Indisponível', apiOk && database?.status !== 'error' ? 'online' : 'offline');
        setStatus('stream-status', streamServices[0].detail, STATUS_CLASS[streamServices[0].status]);
        setStatus('loop-status', streamServices[1].detail, STATUS_CLASS[streamServices[1].status]);
    }

    function fallbackServices(apiOk) {
        return [{
            id: 'api',
            label: 'API Fastify',
            status: apiOk ? 'ok' : 'error',
            detail: apiOk ? 'Backend respondendo.' : 'Não foi possível consultar o monitor administrativo.',
            checkedAt: new Date().toISOString(),
        }];
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

    function streamHealth(streams, branding) {
        const checkedAt = new Date().toISOString();
        const liveStatus = (() => {
            if (branding?.liveSource === 'youtube' && branding.liveYoutubeUrl) {
                return { status: 'ok', detail: 'YouTube configurado' };
            }
            if (branding?.liveSource === 'youtube') {
                return { status: 'warning', detail: 'YouTube sem URL' };
            }
            return streams.live
                ? { status: 'ok', detail: 'OBS ao vivo' }
                : { status: 'warning', detail: 'OBS sem publisher' };
        })();
        return [
            { id: 'stream-live', label: 'Sinal ao vivo', status: liveStatus.status, detail: liveStatus.detail, checkedAt },
            { id: 'stream-loop', label: 'Programação 24h', status: streams.loop ? 'ok' : 'error', detail: streams.loop ? 'Loop operacional' : 'Loop HLS indisponível', checkedAt },
        ];
    }

    function renderOperations(services) {
        const container = byId('operations-health-grid');
        if (!services.length) return renderEmpty(container, 'Nenhum serviço monitorado.');
        clear(container);
        services.forEach((service) => {
            const card = element('article', { className: `operation-health-card ${service.status}` });
            card.append(
                icon(SERVICE_ICONS[service.id] || 'fa-solid fa-circle-info'),
                operationCopy(service),
            );
            container.append(card);
        });
    }

    function operationCopy(service) {
        const copy = element('div');
        copy.append(
            element('strong', { text: service.label }),
            element('span', { text: service.detail }),
            element('small', { text: STATUS_LABELS[service.status] || service.status }),
        );
        return copy;
    }

    function renderSummary(services) {
        const summary = services.reduce((accumulator, service) => {
            accumulator[service.status] = (accumulator[service.status] || 0) + 1;
            return accumulator;
        }, {});
        const status = summary.error ? 'error' : summary.warning ? 'warning' : 'ok';
        const label = summary.error
            ? `${summary.error} falha${summary.error > 1 ? 's' : ''}`
            : summary.warning
                ? `${summary.warning} alerta${summary.warning > 1 ? 's' : ''}`
                : 'Tudo OK';
        setStatus('operations-summary-status', label, STATUS_CLASS[status]);
    }

    function renderOperationalLog(services, logs) {
        const container = byId('operations-log-list');
        const issues = services
            .filter((service) => service.status === 'warning' || service.status === 'error')
            .map((service) => ({
                title: service.status === 'error' ? `Falha atual: ${service.label}` : `Atenção atual: ${service.label}`,
                detail: service.detail,
                createdAt: service.checkedAt,
                iconClass: service.status === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-triangle-exclamation',
            }));
        const operationalLogs = logs.map((log) => ({
            title: ACTION_LABELS[log.action] || log.action,
            detail: `${log.targetId || log.targetType}${log.metadata?.detail ? ` · ${log.metadata.detail}` : ''}`,
            createdAt: log.createdAt,
            iconClass: log.action.endsWith('recovered') ? 'fa-regular fa-circle-check' : 'fa-solid fa-triangle-exclamation',
        }));
        const rows = [...issues, ...operationalLogs].slice(0, 12);
        if (!rows.length) return renderEmpty(container, 'Nenhum alerta operacional registrado.');
        clear(container);
        rows.forEach((row) => {
            const copy = element('div');
            copy.append(element('strong', { text: row.title }), element('span', { text: row.detail }));
            const item = element('div', { className: 'audit-row' });
            item.append(icon(row.iconClass), copy, element('time', { text: formatDate(row.createdAt) }));
            container.append(item);
        });
    }

    function setStatus(id, label, mode) {
        const target = byId(id);
        target.textContent = label;
        target.className = `status-pill ${mode}`;
    }

    function formatDate(value) {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    }

    return { loadAudit, checkStatus };
}
