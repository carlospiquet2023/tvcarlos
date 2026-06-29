import { apiJson } from './js/api-client.js';
import { byId, clear, element, icon } from './js/dom.js';
import './js/client-guard.js';
import { bindUpload } from './js/admin/upload.js';
import { showToast, setBusy, renderEmpty } from './js/admin/ui.js';

const STATUS_LABELS = Object.freeze({
    pending: 'Pendente',
    approved: 'Aprovada',
    hidden: 'Oculta',
    answered: 'Respondida',
    archived: 'Arquivada',
});

const state = {
    session: null,
    rooms: [],
    selectedRoomId: null,
    interaction: { messages: [], filter: 'pending', replyDrafts: new Map() },
};
const INTERACTION_REFRESH_MS = 7_000;
let interactionRefreshTimer = null;
let interactionLoading = false;
let interactionReloadQueued = false;

async function initialize() {
    try {
        state.session = await apiJson('/api/auth/session');
        byId('professor-username').textContent = state.session.user.username;
        bindControls();
        bindUploads();
        await loadRooms();
        startInteractionAutoRefresh();
        document.body.classList.remove('auth-loading');
    } catch {
        location.replace('login.html');
    }
}

function bindControls() {
    byId('professor-refresh-btn').addEventListener('click', loadSelectedRoom);
    byId('professor-interaction-refresh-btn').addEventListener('click', () => loadInteraction(true));
    byId('professor-logout-btn').addEventListener('click', async () => {
        try { await apiJson('/api/auth/logout', { method: 'POST' }); }
        finally { location.replace('login.html'); }
    });
    byId('professor-material-form').addEventListener('submit', saveMaterial);
    byId('professor-material-enabled-input').addEventListener('change', updateMaterialMode);
    byId('professor-material-type-input').addEventListener('change', updateMaterialMode);
    byId('professor-material-prev-page-btn').addEventListener('click', () => changeMaterialPage(-1));
    byId('professor-material-next-page-btn').addEventListener('click', () => changeMaterialPage(1));
    byId('professor-message-filter-input').addEventListener('change', (event) => {
        state.interaction.filter = event.currentTarget.value;
        renderMessages();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void loadInteraction();
    });
    window.addEventListener('pagehide', () => window.clearInterval(interactionRefreshTimer), { once: true });
}

function startInteractionAutoRefresh() {
    window.clearInterval(interactionRefreshTimer);
    interactionRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void loadInteraction();
    }, INTERACTION_REFRESH_MS);
}

function bindUploads() {
    bindUpload({
        fileId: 'professor-material-pdf-upload',
        targetId: 'professor-material-url-input',
        statusId: 'professor-material-upload-status',
        endpoint: '/api/upload/document',
        valueKey: 'url',
        onComplete: (file) => showToast('PDF enviado', file.name),
        onError: (error) => showToast('Falha no upload do PDF', error.message, 'error'),
    });
    bindUpload({
        fileId: 'professor-material-image-upload',
        targetId: 'professor-material-url-input',
        statusId: 'professor-material-upload-status',
        endpoint: '/api/upload/image',
        valueKey: 'url',
        onComplete: (file) => showToast('Imagem enviada', file.name),
        onError: (error) => showToast('Falha no upload da imagem', error.message, 'error'),
    });
}

async function loadRooms() {
    state.rooms = await apiJson('/api/teacher/private-rooms');
    renderRoomNav();
    state.selectedRoomId = state.selectedRoomId || state.rooms[0]?.id || null;
    await loadSelectedRoom();
}

async function loadSelectedRoom() {
    if (!state.selectedRoomId) {
        byId('professor-heading').textContent = 'Nenhuma sala liberada';
        renderEmpty(byId('professor-message-list'), 'Peça ao admin principal para liberar uma sala privada para este usuário.');
        return;
    }
    const latestRooms = await apiJson('/api/teacher/private-rooms');
    state.rooms = latestRooms;
    const room = selectedRoom();
    if (!room) {
        state.selectedRoomId = latestRooms[0]?.id || null;
        return loadSelectedRoom();
    }
    renderRoomNav();
    renderMaterial(room);
    await loadInteraction();
    byId('professor-last-sync').textContent = `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date())}`;
}

function renderRoomNav() {
    const nav = byId('professor-room-nav');
    clear(nav);
    state.rooms.forEach((room) => {
        const link = element('a', { attributes: { href: '#', 'data-room-id': room.id } });
        link.classList.toggle('active', room.id === state.selectedRoomId);
        link.append(icon('fa-solid fa-lock'), element('span', { text: room.title }), element('b', { text: room.roomCode }));
        link.addEventListener('click', (event) => {
            event.preventDefault();
            state.selectedRoomId = room.id;
            loadSelectedRoom();
        });
        nav.append(link);
    });
}

function renderMaterial(room) {
    byId('professor-room-title').textContent = room.title;
    byId('professor-heading').textContent = room.title;
    const link = byId('professor-open-room-link');
    link.href = `${location.origin}/sala-privada.html?room=${encodeURIComponent(room.roomCode)}`;
    link.classList.remove('hidden');

    byId('professor-material-enabled-input').checked = Boolean(room.supportMaterialEnabled);
    byId('professor-material-title-input').value = room.supportMaterialTitle || 'Material de apoio';
    byId('professor-material-type-input').value = room.supportMaterialType || 'pdf';
    byId('professor-material-url-input').value = room.supportMaterialUrl || '';
    byId('professor-material-page-input').value = String(room.supportMaterialCurrentPage || 1);
    updateMaterialMode();
}

function updateMaterialMode() {
    const enabled = byId('professor-material-enabled-input').checked;
    const type = byId('professor-material-type-input').value;
    byId('professor-material-title-input').disabled = !enabled;
    byId('professor-material-type-input').disabled = !enabled;
    byId('professor-material-url-input').disabled = !enabled;
    byId('professor-material-page-input').disabled = !enabled || type !== 'pdf';
    byId('professor-material-prev-page-btn').disabled = !enabled || type !== 'pdf';
    byId('professor-material-next-page-btn').disabled = !enabled || type !== 'pdf';
    byId('professor-material-page-group').classList.toggle('hidden', !enabled || type !== 'pdf');
    byId('professor-material-pdf-upload-button').classList.toggle('hidden', !enabled || type !== 'pdf');
    byId('professor-material-image-upload-button').classList.toggle('hidden', !enabled || type !== 'image');
}

async function saveMaterial(event) {
    event?.preventDefault();
    if (!state.selectedRoomId) return;
    const form = byId('professor-material-form');
    setBusy(form, true);
    try {
        const updated = await apiJson(
            `/api/teacher/private-rooms/${encodeURIComponent(state.selectedRoomId)}/material`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(materialPayload()),
            },
        );
        replaceRoom(updated);
        renderMaterial(updated);
        showToast('Material salvo', 'A sala privada foi atualizada.');
    } catch (error) {
        showToast('Não foi possível salvar o material', error.message, 'error');
    } finally {
        setBusy(form, false);
    }
}

async function changeMaterialPage(delta) {
    const input = byId('professor-material-page-input');
    input.value = String(Math.max(1, (Number.parseInt(input.value, 10) || 1) + delta));
    await saveMaterial();
}

function materialPayload() {
    return {
        supportMaterialEnabled: byId('professor-material-enabled-input').checked,
        supportMaterialTitle: byId('professor-material-title-input').value.trim() || 'Material de apoio',
        supportMaterialType: byId('professor-material-type-input').value,
        supportMaterialUrl: byId('professor-material-url-input').value.trim(),
        supportMaterialCurrentPage: Math.max(1, Number.parseInt(byId('professor-material-page-input').value, 10) || 1),
    };
}

async function loadInteraction(showFeedback = false) {
    if (!state.selectedRoomId) return;
    if (interactionLoading) {
        interactionReloadQueued = true;
        return;
    }
    interactionLoading = true;
    const roomId = state.selectedRoomId;
    collectReplyDrafts();
    try {
        const interaction = await apiJson(`/api/teacher/private-rooms/${encodeURIComponent(roomId)}/interaction`);
        if (state.selectedRoomId !== roomId) return;
        state.interaction.messages = interaction.messages || [];
        renderMessages();
        const pending = state.interaction.messages.filter((message) => message.status === 'pending').length;
        byId('professor-pending-count').textContent = `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`;
        if (showFeedback) showToast('Mensagens atualizadas', 'Interação sincronizada.');
    } catch (error) {
        showToast('Falha ao carregar interação', error.message, 'error');
    } finally {
        interactionLoading = false;
        if (interactionReloadQueued) {
            interactionReloadQueued = false;
            void loadInteraction();
        }
    }
}

function collectReplyDrafts() {
    document.querySelectorAll('#professor-message-list textarea[data-message-id]').forEach((textarea) => {
        const messageId = textarea.dataset.messageId;
        if (!messageId) return;
        const originalReply = textarea.dataset.originalReply || '';
        if (textarea.value !== originalReply) state.interaction.replyDrafts.set(messageId, textarea.value);
        else state.interaction.replyDrafts.delete(messageId);
    });
}

function renderMessages() {
    const container = byId('professor-message-list');
    const messages = filteredMessages();
    if (!messages.length) {
        renderEmpty(container, 'Nenhuma mensagem nesse filtro.');
        return;
    }
    clear(container);
    messages.forEach((message) => container.append(renderMessage(message)));
}

function renderMessage(message) {
    const row = element('article', { className: `interaction-message${message.isHighlighted ? ' highlighted' : ''}` });
    const author = element('div', { className: 'interaction-message-author' });
    author.append(
        element('strong', { text: message.participantName || 'Sem nome' }),
        element('span', { text: formatDate(message.createdAt) }),
    );
    const status = element('span', { className: `interaction-status ${message.status}`, text: message.isHighlighted ? 'Destacada' : (STATUS_LABELS[message.status] || message.status) });
    const header = element('div', { className: 'interaction-message-header' });
    header.append(author, status);

    const reply = element('textarea', {
        className: 'form-control',
        attributes: { maxlength: '1000', rows: '3', placeholder: 'Resposta do professor' },
    });
    const originalReply = message.adminReply || '';
    reply.dataset.messageId = message.id;
    reply.dataset.originalReply = originalReply;
    reply.value = state.interaction.replyDrafts.get(message.id) ?? originalReply;
    reply.addEventListener('input', () => {
        if (reply.value !== originalReply) state.interaction.replyDrafts.set(message.id, reply.value);
        else state.interaction.replyDrafts.delete(message.id);
    });

    const actions = element('div', { className: 'interaction-message-actions' });
    actions.append(
        textButton('fa-regular fa-circle-check', 'Aprovar', () => updateMessage(message, { status: 'approved' }), { disabled: message.status === 'approved' }),
        textButton('fa-regular fa-message', 'Responder', () => answerMessage(message, reply)),
        textButton(message.isHighlighted ? 'fa-regular fa-star' : 'fa-solid fa-star', message.isHighlighted ? 'Remover destaque' : 'Destacar', () => toggleHighlight(message)),
        textButton('fa-regular fa-eye-slash', 'Ocultar', () => updateMessage(message, { status: 'hidden', isHighlighted: false }), { danger: true }),
    );

    row.append(header);
    if (message.participantContact) row.append(element('div', { className: 'interaction-message-contact', text: message.participantContact }));
    row.append(element('p', { className: 'interaction-message-body', text: message.body }), reply, actions);
    return row;
}

function filteredMessages() {
    const filter = state.interaction.filter;
    if (filter === 'all') return state.interaction.messages;
    if (filter === 'highlighted') return state.interaction.messages.filter((message) => message.isHighlighted);
    return state.interaction.messages.filter((message) => message.status === filter);
}

async function answerMessage(message, textarea) {
    const adminReply = textarea.value.trim();
    if (!adminReply) {
        showToast('Resposta vazia', 'Escreva a resposta antes de marcar como respondida.', 'error');
        return;
    }
    await updateMessage(message, { status: 'answered', adminReply });
}

async function toggleHighlight(message) {
    await updateMessage(message, message.isHighlighted
        ? { isHighlighted: false }
        : { status: message.status === 'answered' ? 'answered' : 'approved', isHighlighted: true });
}

async function updateMessage(message, payload) {
    try {
        await apiJson(`/api/private-room-messages/${encodeURIComponent(message.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (Object.hasOwn(payload, 'adminReply')) state.interaction.replyDrafts.delete(message.id);
        await loadInteraction();
        showToast('Mensagem atualizada', 'Ação registrada.');
    } catch (error) {
        showToast('Falha ao moderar mensagem', error.message, 'error');
    }
}

function textButton(iconClass, label, callback, { danger = false, disabled = false } = {}) {
    const button = element('button', { className: `admin-btn ${danger ? 'danger' : 'secondary'}`, attributes: { type: 'button' } });
    button.append(icon(iconClass), document.createTextNode(` ${label}`));
    button.disabled = disabled;
    button.addEventListener('click', callback);
    return button;
}

function selectedRoom() {
    return state.rooms.find((room) => room.id === state.selectedRoomId);
}

function replaceRoom(room) {
    state.rooms = state.rooms.map((item) => item.id === room.id ? room : item);
}

function formatDate(value) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

initialize();
