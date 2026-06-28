import { apiJson } from '../api-client.js';
import { byId, clear, element, icon, setButtonContent } from '../dom.js';
import { adminState, ENDPOINTS, jsonRequest } from './core.js';
import { bindUpload } from './upload.js';
import { actionButton, confirmRemoval, renderEmpty, setBusy, showToast } from './ui.js';

const SOURCE_LABELS = Object.freeze({
    live: ['Sinal ao vivo', 'Usa o mesmo sinal principal da TV Carlos.'],
    youtube: ['YouTube', 'Cole o link de compartilhamento do vídeo ou da live.'],
    video: ['Vídeo próprio', 'Use um arquivo enviado pelo painel ou uma URL HTTPS direta.'],
    external: ['Sala externa', 'Abre uma URL HTTPS externa controlada por você.'],
});

const STATUS_LABELS = Object.freeze({
    pending: 'Pendente',
    approved: 'Aprovada',
    hidden: 'Oculta',
    answered: 'Respondida',
    archived: 'Arquivada',
});

let latestCredentials = null;

export function createPrivateRoomAdminController({ navigate, onMutation }) {
    function initialize() {
        bindForm();
        bindUploads();
        bindInteraction();
        byId('private-room-source-type-input').addEventListener('change', updateSourceMode);
        byId('private-room-material-type-input').addEventListener('change', updateMaterialMode);
        byId('private-room-material-enabled-input').addEventListener('change', updateMaterialMode);
        byId('private-room-material-prev-page-btn').addEventListener('click', () => changeMaterialPage(-1));
        byId('private-room-material-next-page-btn').addEventListener('click', () => changeMaterialPage(1));
        byId('private-room-cancel-btn').addEventListener('click', cancelEditing);
        byId('private-room-copy-credentials-btn').addEventListener('click', () => {
            if (latestCredentials) copyRoomCredentials(latestCredentials.room, latestCredentials.accessPassword);
        });
        updateSourceMode();
        updateMaterialMode();
    }

    async function load() {
        adminState.privateRooms = await apiJson(ENDPOINTS.privateRooms);
        render();
        updateCounters();
        syncInteractionRoomSelect();
        await loadInteraction();
    }

    function render() {
        const container = byId('active-private-rooms-list');
        if (!adminState.privateRooms.length) return renderEmpty(container, 'Nenhuma sala privada criada.');
        clear(container);
        adminState.privateRooms.forEach((room) => container.append(renderRoomRow(room)));
    }

    function renderRoomRow(room) {
        const [sourceLabel, sourceDescription] = SOURCE_LABELS[room.sourceType] || SOURCE_LABELS.youtube;
        const status = room.isActive ? roomStatus(room) : 'Inativa';
        const badge = element('span', { className: `resource-index private-room-status ${room.isActive ? 'active' : 'inactive'}` });
        badge.append(icon(room.isActive ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock'));

        const content = element('div', { className: 'resource-main' });
        content.append(
            element('strong', { text: `${room.title} · ID ${room.roomCode}` }),
            element('p', { text: room.description || sourceDescription }),
            element('small', { text: `${sourceLabel} · ${status}` }),
        );

        const actions = element('div', { className: 'resource-actions' });
        actions.append(
            actionButton('fa-regular fa-comments', 'Abrir interação da sala', () => selectInteractionRoom(room)),
            actionButton('fa-regular fa-copy', 'Copiar link da sala', () => copyRoomLink(room)),
            actionButton('fa-solid fa-key', 'Gerar nova senha', () => rotatePassword(room)),
            actionButton('fa-regular fa-pen-to-square', 'Editar', () => startEditing(room)),
            actionButton('fa-regular fa-trash-can', 'Remover', () => remove(room), { danger: true }),
        );

        const row = element('article', { className: 'resource-row private-room-row' });
        row.append(badge, content, actions);
        return row;
    }

    function updateCounters() {
        byId('nav-private-room-count').textContent = String(adminState.privateRooms.length);
        byId('private-room-list-count').textContent = `${adminState.privateRooms.length} ${adminState.privateRooms.length === 1 ? 'sala' : 'salas'}`;
        byId('stat-private-rooms').textContent = String(adminState.privateRooms.length);
    }

    function bindForm() {
        byId('add-private-room-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const editing = adminState.editing.privateRooms;
            setBusy(form, true);
            try {
                const response = await apiJson(
                    editing ? `${ENDPOINTS.privateRooms}/${encodeURIComponent(editing)}` : ENDPOINTS.privateRooms,
                    jsonRequest(editing ? 'PUT' : 'POST', buildPayload()),
                );
                if (!editing && response.accessPassword) {
                    latestCredentials = response;
                    showCredentials(response.room, response.accessPassword);
                } else {
                    hideCredentials();
                }
                cancelEditing();
                await Promise.all([load(), onMutation()]);
                showToast(editing ? 'Sala atualizada' : 'Sala criada', editing ? 'Configurações salvas.' : 'Copie o ID e a senha gerados pelo sistema.');
            } catch (error) {
                showToast('Não foi possível salvar a sala', error.message, 'error');
            } finally {
                setBusy(form, false);
            }
        });
    }

    function bindUploads() {
        bindUpload({
            fileId: 'private-room-source-upload',
            targetId: 'private-room-source-url-input',
            statusId: 'private-room-source-upload-status',
            endpoint: '/api/upload/video',
            valueKey: 'filename',
            onComplete: (file) => showToast('Upload concluído', file.name),
            onError: (error) => showToast('Falha no upload', error.message, 'error'),
        });
        bindUpload({
            fileId: 'private-room-material-pdf-upload',
            targetId: 'private-room-material-url-input',
            statusId: 'private-room-material-upload-status',
            endpoint: '/api/upload/document',
            valueKey: 'url',
            onComplete: (file) => showToast('PDF enviado', file.name),
            onError: (error) => showToast('Falha no upload do PDF', error.message, 'error'),
        });
        bindUpload({
            fileId: 'private-room-material-image-upload',
            targetId: 'private-room-material-url-input',
            statusId: 'private-room-material-upload-status',
            endpoint: '/api/upload/image',
            valueKey: 'url',
            onComplete: (file) => showToast('Imagem enviada', file.name),
            onError: (error) => showToast('Falha no upload da imagem', error.message, 'error'),
        });
    }

    function bindInteraction() {
        byId('private-room-interaction-room-select').addEventListener('change', (event) => {
            adminState.privateRoomInteraction.selectedRoomId = event.currentTarget.value || null;
            loadInteraction();
        });
        byId('private-room-interaction-settings-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            await saveInteractionSettings(event.currentTarget);
        });
        byId('private-room-interaction-filter-input').addEventListener('change', (event) => {
            adminState.privateRoomInteraction.filter = event.currentTarget.value;
            renderInteractionMessages();
        });
        byId('private-room-interaction-refresh-btn').addEventListener('click', () => loadInteraction(true));
        byId('private-room-interaction-archive-btn').addEventListener('click', archiveInteractionHistory);
        byId('private-room-interaction-export-btn').addEventListener('click', exportInteractionCsv);
    }

    function syncInteractionRoomSelect() {
        const select = byId('private-room-interaction-room-select');
        clear(select);
        adminState.privateRooms.forEach((room) => {
            select.append(element('option', { text: `${room.title} · ${room.roomCode}`, attributes: { value: room.id } }));
        });
        const selected = adminState.privateRoomInteraction.selectedRoomId;
        const hasSelected = selected && adminState.privateRooms.some((room) => room.id === selected);
        adminState.privateRoomInteraction.selectedRoomId = hasSelected ? selected : (adminState.privateRooms[0]?.id ?? null);
        select.value = adminState.privateRoomInteraction.selectedRoomId || '';
        select.disabled = adminState.privateRooms.length === 0;
        byId('private-room-interaction-settings-form').classList.toggle('is-disabled', adminState.privateRooms.length === 0);
        if (!adminState.privateRooms.length) resetInteractionPanel();
    }

    function resetInteractionPanel() {
        adminState.privateRoomInteraction.settings = null;
        adminState.privateRoomInteraction.messages = [];
        byId('private-room-interaction-pending-count').textContent = '0 pendentes';
        renderEmpty(byId('private-room-interaction-message-list'), 'Crie uma sala privada para ativar a interação.');
    }

    async function loadInteraction(showFeedback = false) {
        const roomId = adminState.privateRoomInteraction.selectedRoomId;
        if (!roomId) {
            resetInteractionPanel();
            return;
        }
        try {
            const interaction = await apiJson(`${ENDPOINTS.privateRooms}/${encodeURIComponent(roomId)}/interaction`);
            adminState.privateRoomInteraction.settings = interaction.settings;
            adminState.privateRoomInteraction.messages = interaction.messages || [];
            renderInteractionSettings();
            renderInteractionMessages();
            updateInteractionCounters();
            if (showFeedback) showToast('Interação atualizada', 'Mensagens sincronizadas.');
        } catch (error) {
            showToast('Falha ao carregar interação', error.message, 'error');
        }
    }

    function renderInteractionSettings() {
        const settings = adminState.privateRoomInteraction.settings;
        if (!settings) return;
        byId('private-room-interaction-enabled-input').checked = Boolean(settings.enabled);
        byId('private-room-interaction-mode-input').value = settings.mode;
        byId('private-room-interaction-require-name-input').checked = Boolean(settings.requireName);
        byId('private-room-interaction-anonymous-input').checked = Boolean(settings.allowAnonymous);
        byId('private-room-interaction-contact-input').checked = Boolean(settings.collectContact);
        byId('private-room-interaction-moderation-input').checked = Boolean(settings.moderationRequired);
        byId('private-room-interaction-public-replies-input').checked = Boolean(settings.allowPublicReplies);
        byId('private-room-interaction-notice-input').value = settings.noticeText || '';
    }

    function renderInteractionMessages() {
        const container = byId('private-room-interaction-message-list');
        const messages = filteredInteractionMessages();
        if (!messages.length) {
            renderEmpty(container, 'Nenhuma mensagem nesse filtro.');
            return;
        }
        clear(container);
        messages.forEach((message) => container.append(renderInteractionMessage(message)));
    }

    function renderInteractionMessage(message) {
        const row = element('article', { className: `interaction-message${message.isHighlighted ? ' highlighted' : ''}` });
        const author = element('div', { className: 'interaction-message-author' });
        author.append(
            element('strong', { text: message.participantName || 'Sem nome' }),
            element('span', { text: formatMessageTime(message.createdAt) }),
        );
        const status = element('span', { className: `interaction-status ${message.status}`, text: message.isHighlighted ? 'Destacada' : (STATUS_LABELS[message.status] || message.status) });
        const header = element('div', { className: 'interaction-message-header' });
        header.append(author, status);

        const reply = element('textarea', {
            className: 'form-control',
            attributes: { maxlength: '1000', rows: '3', placeholder: 'Resposta do admin' },
        });
        reply.value = message.adminReply || '';
        const replyBox = element('div', { className: 'interaction-message-reply' });
        replyBox.append(reply);

        const actions = element('div', { className: 'interaction-message-actions' });
        actions.append(
            textActionButton('fa-regular fa-circle-check', 'Aprovar', () => updateMessage(message, { status: 'approved' }), { disabled: message.status === 'approved' }),
            textActionButton('fa-regular fa-message', 'Responder', () => answerMessage(message, reply)),
            textActionButton(message.isHighlighted ? 'fa-regular fa-star' : 'fa-solid fa-star', message.isHighlighted ? 'Remover destaque' : 'Destacar', () => toggleHighlight(message)),
            textActionButton('fa-regular fa-eye-slash', 'Ocultar', () => updateMessage(message, { status: 'hidden', isHighlighted: false }), { disabled: message.status === 'hidden', danger: true }),
            textActionButton('fa-solid fa-box-archive', 'Arquivar', () => updateMessage(message, { status: 'archived', isHighlighted: false }), { danger: true }),
        );

        row.append(header);
        if (message.participantContact) row.append(element('div', { className: 'interaction-message-contact', text: message.participantContact }));
        row.append(element('p', { className: 'interaction-message-body', text: message.body }), replyBox, actions);
        return row;
    }

    function filteredInteractionMessages() {
        const filter = adminState.privateRoomInteraction.filter;
        const messages = adminState.privateRoomInteraction.messages;
        if (filter === 'all') return messages;
        if (filter === 'highlighted') return messages.filter((message) => message.isHighlighted);
        return messages.filter((message) => message.status === filter);
    }

    function updateInteractionCounters() {
        const pending = adminState.privateRoomInteraction.messages.filter((message) => message.status === 'pending').length;
        byId('private-room-interaction-pending-count').textContent = `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`;
    }

    async function saveInteractionSettings(form) {
        const roomId = adminState.privateRoomInteraction.selectedRoomId;
        if (!roomId) return;
        setBusy(form, true);
        try {
            adminState.privateRoomInteraction.settings = await apiJson(
                `${ENDPOINTS.privateRooms}/${encodeURIComponent(roomId)}/interaction/settings`,
                jsonRequest('PUT', buildInteractionSettingsPayload()),
            );
            await Promise.all([loadInteraction(), onMutation()]);
            showToast('Interação salva', 'Configurações aplicadas à sala.');
        } catch (error) {
            showToast('Não foi possível salvar a interação', error.message, 'error');
        } finally {
            setBusy(form, false);
        }
    }

    function buildInteractionSettingsPayload() {
        return {
            enabled: byId('private-room-interaction-enabled-input').checked,
            mode: byId('private-room-interaction-mode-input').value,
            requireName: byId('private-room-interaction-require-name-input').checked,
            allowAnonymous: byId('private-room-interaction-anonymous-input').checked,
            collectContact: byId('private-room-interaction-contact-input').checked,
            moderationRequired: byId('private-room-interaction-moderation-input').checked,
            allowPublicReplies: byId('private-room-interaction-public-replies-input').checked,
            noticeText: byId('private-room-interaction-notice-input').value.trim(),
        };
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
        if (message.isHighlighted) {
            await updateMessage(message, { isHighlighted: false });
            return;
        }
        await updateMessage(message, { status: message.status === 'answered' ? 'answered' : 'approved', isHighlighted: true });
    }

    async function updateMessage(message, payload) {
        try {
            await apiJson(`${ENDPOINTS.privateRoomMessages}/${encodeURIComponent(message.id)}`, jsonRequest('PATCH', payload));
            await Promise.all([loadInteraction(), onMutation()]);
            showToast('Mensagem atualizada', 'Ação de moderação registrada.');
        } catch (error) {
            showToast('Falha ao moderar mensagem', error.message, 'error');
        }
    }

    async function archiveInteractionHistory() {
        const roomId = adminState.privateRoomInteraction.selectedRoomId;
        if (!roomId) return;
        if (!(await confirmRemoval('Arquivar o histórico de interação desta sala? As mensagens deixam de aparecer na fila ativa.'))) return;
        try {
            await apiJson(`${ENDPOINTS.privateRooms}/${encodeURIComponent(roomId)}/interaction/archive`, { method: 'POST' });
            await Promise.all([loadInteraction(), onMutation()]);
            showToast('Histórico arquivado', 'As mensagens foram removidas da fila ativa.');
        } catch (error) {
            showToast('Falha ao arquivar histórico', error.message, 'error');
        }
    }

    function exportInteractionCsv() {
        const messages = adminState.privateRoomInteraction.messages;
        if (!messages.length) {
            showToast('Nada para exportar', 'Esta sala ainda não tem mensagens.', 'error');
            return;
        }
        const header = ['data', 'status', 'destacada', 'nome', 'contato', 'mensagem', 'resposta'];
        const rows = messages.map((message) => [
            message.createdAt,
            STATUS_LABELS[message.status] || message.status,
            message.isHighlighted ? 'sim' : 'nao',
            message.participantName,
            message.participantContact,
            message.body,
            message.adminReply,
        ]);
        const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = element('a', { attributes: { href: url, download: 'interacao-sala.csv' } });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('CSV exportado', 'Histórico da interação baixado.');
    }

    function selectInteractionRoom(room) {
        adminState.privateRoomInteraction.selectedRoomId = room.id;
        byId('private-room-interaction-room-select').value = room.id;
        loadInteraction(true);
        navigate('private-rooms');
        byId('private-room-interaction-room-select').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function buildPayload() {
        const sourceType = byId('private-room-source-type-input').value;
        const expiresAt = byId('private-room-expires-at-input').value;
        return {
            title: byId('private-room-title-input').value.trim(),
            description: byId('private-room-description-input').value.trim(),
            sourceType,
            sourceUrl: sourceType === 'live' ? '' : byId('private-room-source-url-input').value.trim(),
            supportMaterialEnabled: byId('private-room-material-enabled-input').checked,
            supportMaterialTitle: byId('private-room-material-title-input').value.trim() || 'Material de apoio',
            supportMaterialType: byId('private-room-material-type-input').value,
            supportMaterialUrl: byId('private-room-material-url-input').value.trim(),
            supportMaterialCurrentPage: Math.max(1, Number.parseInt(byId('private-room-material-page-input').value, 10) || 1),
            isActive: byId('private-room-active-input').checked,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        };
    }

    function startEditing(room) {
        adminState.editing.privateRooms = room.id;
        byId('private-room-title-input').value = room.title;
        byId('private-room-description-input').value = room.description || '';
        byId('private-room-source-type-input').value = room.sourceType;
        byId('private-room-source-url-input').value = room.sourceUrl || '';
        byId('private-room-material-enabled-input').checked = Boolean(room.supportMaterialEnabled);
        byId('private-room-material-title-input').value = room.supportMaterialTitle || 'Material de apoio';
        byId('private-room-material-type-input').value = room.supportMaterialType || 'url';
        byId('private-room-material-url-input').value = room.supportMaterialUrl || '';
        byId('private-room-material-page-input').value = String(room.supportMaterialCurrentPage || 1);
        byId('private-room-active-input').checked = Boolean(room.isActive);
        byId('private-room-expires-at-input').value = room.expiresAt ? toDateTimeLocal(room.expiresAt) : '';
        byId('private-room-form-title').textContent = 'Editar sala privada';
        setButtonContent(byId('private-room-submit-btn'), 'fa-solid fa-floppy-disk', 'Salvar sala');
        byId('private-room-cancel-btn').classList.remove('hidden');
        hideCredentials();
        updateSourceMode();
        updateMaterialMode();
        navigate('private-rooms');
    }

    function cancelEditing(resetForm = true) {
        adminState.editing.privateRooms = null;
        if (resetForm) byId('add-private-room-form').reset();
        byId('private-room-form-title').textContent = 'Criar sala privada';
        setButtonContent(byId('private-room-submit-btn'), 'fa-solid fa-plus', 'Criar sala e gerar senha');
        byId('private-room-cancel-btn').classList.add('hidden');
        updateSourceMode();
        updateMaterialMode();
    }

    async function rotatePassword(room) {
        if (!(await confirmRemoval(`Gerar uma nova senha para “${room.title}”? A senha anterior deixará de funcionar.`))) return;
        try {
            const response = await apiJson(`${ENDPOINTS.privateRooms}/${encodeURIComponent(room.id)}/rotate-password`, { method: 'POST' });
            latestCredentials = response;
            showCredentials(response.room, response.accessPassword);
            await Promise.all([load(), onMutation()]);
            showToast('Senha gerada', 'Copie a nova senha antes de sair desta tela.');
        } catch (error) {
            showToast('Não foi possível gerar nova senha', error.message, 'error');
        }
    }

    async function remove(room) {
        if (!(await confirmRemoval(`Deseja remover a sala privada “${room.title}”? Usuários perderão o acesso.`))) return;
        try {
            await apiJson(`${ENDPOINTS.privateRooms}/${encodeURIComponent(room.id)}`, { method: 'DELETE' });
            await Promise.all([load(), onMutation()]);
            showToast('Sala removida', 'O acesso público foi encerrado.');
        } catch (error) {
            showToast('Falha ao remover sala', error.message, 'error');
        }
    }

    function updateSourceMode() {
        const sourceType = byId('private-room-source-type-input').value;
        const sourceInput = byId('private-room-source-url-input');
        const uploadButton = byId('private-room-source-upload-button');
        const hint = byId('private-room-source-hint');
        const [, description] = SOURCE_LABELS[sourceType] || SOURCE_LABELS.youtube;
        sourceInput.disabled = sourceType === 'live';
        sourceInput.required = sourceType !== 'live';
        sourceInput.placeholder = sourceType === 'youtube'
            ? 'https://youtu.be/Abc123xyz'
            : sourceType === 'external'
                ? 'https://meet.google.com/... ou https://site.com.br/...'
                : sourceType === 'video'
                    ? 'arquivo.mp4 ou https://cdn.site.com/video.mp4'
                    : 'Usa o sinal ao vivo principal';
        uploadButton.classList.toggle('hidden', sourceType !== 'video');
        hint.textContent = description;
        if (sourceType === 'live') sourceInput.value = '';
    }

    function updateMaterialMode() {
        const enabled = byId('private-room-material-enabled-input').checked;
        const type = byId('private-room-material-type-input').value;
        const urlInput = byId('private-room-material-url-input');
        const pdfButton = byId('private-room-material-pdf-upload-button');
        const imageButton = byId('private-room-material-image-upload-button');
        const hint = byId('private-room-material-hint');
        urlInput.required = enabled;
        urlInput.disabled = !enabled;
        byId('private-room-material-title-input').disabled = !enabled;
        byId('private-room-material-type-input').disabled = !enabled;
        byId('private-room-material-page-input').disabled = !enabled || type !== 'pdf';
        byId('private-room-material-prev-page-btn').disabled = !enabled || type !== 'pdf';
        byId('private-room-material-next-page-btn').disabled = !enabled || type !== 'pdf';
        byId('private-room-material-page-group').classList.toggle('hidden', !enabled || type !== 'pdf');
        pdfButton.classList.toggle('hidden', !enabled || type !== 'pdf');
        imageButton.classList.toggle('hidden', !enabled || type !== 'image');
        urlInput.placeholder = type === 'pdf'
            ? '/documents/arquivo.pdf ou https://site.com/aula.pdf'
            : type === 'image'
                ? '/uploads/imagem.webp ou https://site.com/slide.png'
                : 'https://docs.google.com/... ou https://site.com/aula.pdf';
        hint.textContent = type === 'pdf'
            ? 'Envie um PDF ou cole uma URL HTTPS para o PDF.'
            : type === 'image'
                ? 'Envie uma imagem do slide ou cole uma URL HTTPS de imagem.'
                : 'Use link HTTPS de slide, PDF, página de apresentação ou material externo.';
    }

    async function changeMaterialPage(delta) {
        const input = byId('private-room-material-page-input');
        input.value = String(Math.max(1, (Number.parseInt(input.value, 10) || 1) + delta));
        if (!adminState.editing.privateRooms) return;
        try {
            await apiJson(
                `${ENDPOINTS.privateRooms}/${encodeURIComponent(adminState.editing.privateRooms)}`,
                jsonRequest('PUT', buildPayload()),
            );
            await Promise.all([load(), onMutation()]);
            showToast('Página enviada', `Página ${input.value} sincronizada na sala.`);
        } catch (error) {
            showToast('Não foi possível trocar a página', error.message, 'error');
        }
    }

    function showCredentials(room, accessPassword) {
        const link = `${location.origin}/sala-privada.html?room=${encodeURIComponent(room.roomCode)}`;
        byId('private-room-credential-id').textContent = room.roomCode;
        byId('private-room-credential-password').textContent = accessPassword;
        byId('private-room-credential-link').textContent = link;
        byId('private-room-credentials').classList.remove('hidden');
    }

    function hideCredentials() {
        byId('private-room-credentials').classList.add('hidden');
    }

    function copyRoomLink(room) {
        return copyText(`${location.origin}/sala-privada.html?room=${encodeURIComponent(room.roomCode)}`, 'Link copiado', 'Envie esse link junto com o ID e a senha.');
    }

    function copyRoomCredentials(room, accessPassword) {
        const link = `${location.origin}/sala-privada.html?room=${encodeURIComponent(room.roomCode)}`;
        return copyText(`Sala Privada TV Carlos\nID: ${room.roomCode}\nSenha: ${accessPassword}\nLink: ${link}`, 'Credenciais copiadas', 'Envie somente para o cliente autorizado.');
    }

    async function copyText(text, title, message) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = element('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.append(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            showToast(title, message);
        } catch (error) {
            showToast('Não foi possível copiar', error.message, 'error');
        }
    }

    function textActionButton(iconClass, label, callback, { danger = false, disabled = false } = {}) {
        const button = element('button', {
            className: `admin-btn ${danger ? 'danger' : 'secondary'}`,
            attributes: { type: 'button' },
        });
        button.append(icon(iconClass), document.createTextNode(` ${label}`));
        button.disabled = disabled;
        button.addEventListener('click', callback);
        return button;
    }

    function formatMessageTime(value) {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    }

    function csvCell(value) {
        const normalized = String(value ?? '').replace(/\r?\n/g, ' ').trim();
        const safe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
        return `"${safe.replace(/"/g, '""')}"`;
    }

    function roomStatus(room) {
        if (!room.expiresAt) return 'Ativa sem expiração';
        const expires = new Date(room.expiresAt);
        return expires.getTime() > Date.now()
            ? `Expira em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(expires)}`
            : 'Expirada';
    }

    function toDateTimeLocal(value) {
        const date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }

    return { initialize, load, render, updateCounters };
}
