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

let latestCredentials = null;

export function createPrivateRoomAdminController({ navigate, onMutation }) {
    function initialize() {
        bindForm();
        bindUploads();
        byId('private-room-source-type-input').addEventListener('change', updateSourceMode);
        byId('private-room-cancel-btn').addEventListener('click', cancelEditing);
        byId('private-room-copy-credentials-btn').addEventListener('click', () => {
            if (latestCredentials) copyRoomCredentials(latestCredentials.room, latestCredentials.accessPassword);
        });
        updateSourceMode();
    }

    async function load() {
        adminState.privateRooms = await apiJson(ENDPOINTS.privateRooms);
        render();
        updateCounters();
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
    }

    function buildPayload() {
        const sourceType = byId('private-room-source-type-input').value;
        const expiresAt = byId('private-room-expires-at-input').value;
        return {
            title: byId('private-room-title-input').value.trim(),
            description: byId('private-room-description-input').value.trim(),
            sourceType,
            sourceUrl: sourceType === 'live' ? '' : byId('private-room-source-url-input').value.trim(),
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
        byId('private-room-active-input').checked = Boolean(room.isActive);
        byId('private-room-expires-at-input').value = room.expiresAt ? toDateTimeLocal(room.expiresAt) : '';
        byId('private-room-form-title').textContent = 'Editar sala privada';
        setButtonContent(byId('private-room-submit-btn'), 'fa-solid fa-floppy-disk', 'Salvar sala');
        byId('private-room-cancel-btn').classList.remove('hidden');
        hideCredentials();
        updateSourceMode();
        navigate('private-rooms');
    }

    function cancelEditing(resetForm = true) {
        adminState.editing.privateRooms = null;
        if (resetForm) byId('add-private-room-form').reset();
        byId('private-room-form-title').textContent = 'Criar sala privada';
        setButtonContent(byId('private-room-submit-btn'), 'fa-solid fa-plus', 'Criar sala e gerar senha');
        byId('private-room-cancel-btn').classList.add('hidden');
        updateSourceMode();
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
