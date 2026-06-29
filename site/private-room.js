import './js/client-guard.js';
import { clear, element, icon, requiredElement } from './js/dom.js';
import { buildYouTubeEmbedUrl } from './js/media-source.js';
import { createBrandingController } from './js/public/branding-controller.js';
import { STREAMS } from './js/public/config.js';
import { createBroadcastState } from './js/public/state.js';

const state = createBroadcastState();
const branding = createBrandingController({ state, onBrandingChange: () => undefined });
const roomStage = requiredElement('private-room-stage');
const roomMain = roomStage.closest('.private-room-main');
const player = requiredElement('private-room-player');
const playButton = requiredElement('private-room-play');
const volumeButton = requiredElement('private-room-volume');
const externalLink = requiredElement('private-room-external-link');
const materialToggle = requiredElement('private-room-material-toggle');
const forumToggle = requiredElement('private-room-forum-toggle');
const interactionSection = requiredElement('private-room-interaction');
const interactionForm = requiredElement('private-room-message-form');
const interactionStatus = requiredElement('private-room-message-status');
const participantNameInput = requiredElement('private-room-participant-name');
const participantContactInput = requiredElement('private-room-participant-contact');
const messageBodyInput = requiredElement('private-room-message-body');
const messageSubmitButton = requiredElement('private-room-message-submit');
const approvedMessages = requiredElement('private-room-approved-messages');

let hls = null;
let media = null;
let youtubeFrame = null;
let youtubePlaying = false;
let muted = true;
let materialVisible = true;
let activeRoomCode = null;
let interactionTimer = null;
let roomTimer = null;
let currentInteractionSettings = null;
let interactionVisible = false;
let currentRoomSourceSignature = '';
let currentMaterialSignature = '';

async function initialize() {
    bindControls();
    await branding.load();

    const roomCode = new URLSearchParams(location.search).get('room')?.trim();
    if (!roomCode) {
        renderAccessError('ID da sala não informado.', 'Volte para a TV aberta e informe o ID recebido.');
        return;
    }

    try {
        const room = await fetchPrivateRoom(roomCode);
        activeRoomCode = room.roomCode;
        renderRoom(room);
        await loadInteraction(room.roomCode);
        interactionTimer = window.setInterval(() => loadInteraction(room.roomCode), 10_000);
        roomTimer = window.setInterval(() => refreshRoomState(room.roomCode), 5_000);
    } catch (error) {
        renderAccessError('Acesso não autorizado ou expirado.', error.message, roomCode);
    }
}

async function fetchPrivateRoom(roomCode) {
    const response = await fetch(`/api/private-room-access/${encodeURIComponent(roomCode)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || 'Informe novamente o ID e a senha da sala.');
    return payload;
}

function renderRoom(room) {
    currentRoomSourceSignature = roomSourceSignature(room);
    requiredElement('private-room-title').textContent = room.title;
    requiredElement('private-room-description').textContent = room.description || 'Conteúdo privado liberado para esta sessão.';
    document.title = `${room.title} · Sala Privada · TV Carlos`;
    destroyMedia();
    hideExternalLink();

    if (room.sourceType === 'external') {
        renderExternal(room);
        renderSupportMaterial(room);
        return;
    }

    const youtubeUrl = room.sourceType === 'youtube' ? buildYouTubeEmbedUrl(room.sourceUrl) : buildYouTubeEmbedUrl(room.sourceUrl);
    if (youtubeUrl) {
        renderYouTube(youtubeUrl, room.title);
        renderSupportMaterial(room);
        return;
    }

    renderVideo(room.sourceType === 'live' ? STREAMS.live.url : normalizeVideoUrl(room.sourceUrl), room.sourceType === 'live');
    renderSupportMaterial(room);
}

async function refreshRoomState(roomCode) {
    try {
        const room = await fetchPrivateRoom(roomCode);
        requiredElement('private-room-title').textContent = room.title;
        requiredElement('private-room-description').textContent = room.description || 'Conteúdo privado liberado para esta sessão.';
        document.title = `${room.title} · Sala Privada · TV Carlos`;
        if (roomSourceSignature(room) !== currentRoomSourceSignature) {
            renderRoom(room);
            return;
        }
        if (materialSignature(room) !== currentMaterialSignature) {
            if (!updateSupportMaterialInPlace(room)) renderSupportMaterial(room, { preserveVisibility: true });
        }
    } catch {
        window.clearInterval(roomTimer);
    }
}

function renderYouTube(embedUrl, title) {
    youtubePlaying = false;
    muted = true;
    const frame = element('iframe', {
        className: 'private-room-frame',
        attributes: {
            title,
            src: embedUrl,
            referrerpolicy: 'strict-origin-when-cross-origin',
            allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
            allowfullscreen: '',
        },
    });
    youtubeFrame = frame;
    frame.addEventListener('load', () => sendYouTubeCommand('mute'));
    renderProtectedFrame(frame);
    showMediaControls();
    updateButtons();
}

function renderVideo(sourceUrl, live) {
    muted = true;
    const video = element('video', {
        className: 'private-room-frame',
        attributes: {
            playsinline: '',
            controlsList: 'nodownload nofullscreen noremoteplayback',
        },
    });
    video.muted = true;
    video.autoplay = true;
    video.loop = !live;
    media = video;
    renderProtectedFrame(video);

    const HlsLibrary = window.Hls;
    if (live && HlsLibrary?.isSupported()) {
        hls = new HlsLibrary({ maxLiveSyncPlaybackRate: 1.5, liveSyncDurationCount: 3 });
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hls.on(HlsLibrary.Events.MANIFEST_PARSED, () => video.play().catch(() => undefined));
    } else {
        video.src = sourceUrl;
        video.addEventListener('loadedmetadata', () => video.play().catch(() => undefined), { once: true });
    }
    showMediaControls();
    updateButtons();
}

function renderExternal(room) {
    clear(player);
    player.classList.add('private-room-player-empty');
    const panel = element('div', { className: 'private-room-frame private-room-external-panel' });
    panel.append(
        icon('fa-solid fa-arrow-up-right-from-square'),
        element('h2', { text: room.title }),
        element('p', { text: 'Este conteúdo abre em uma plataforma externa protegida pelo link configurado no painel.' }),
    );
    player.append(panel);
    externalLink.href = room.sourceUrl;
    externalLink.classList.remove('hidden');
    playButton.classList.add('hidden');
    volumeButton.classList.add('hidden');
}

function renderProtectedFrame(frame) {
    clear(player);
    player.classList.remove('private-room-player-empty');
    const overlay = element('button', {
        className: 'private-room-glass-layer',
        title: 'Reproduzir ou pausar',
        attributes: { type: 'button', 'aria-label': 'Reproduzir ou pausar conteúdo privado' },
    });
    overlay.addEventListener('click', togglePlayback);
    const watermark = element('div', { id: 'player-watermark', className: 'private-room-watermark', text: state.branding.watermarkText });
    player.append(frame, overlay, watermark);
}

function bindControls() {
    playButton.addEventListener('click', togglePlayback);
    volumeButton.addEventListener('click', toggleVolume);
    materialToggle.addEventListener('click', toggleSupportMaterial);
    forumToggle.addEventListener('click', () => setInteractionVisible(!interactionVisible));
    requiredElement('private-room-interaction-close').addEventListener('click', () => setInteractionVisible(false));
    interactionForm.addEventListener('submit', submitInteractionMessage);
    window.addEventListener('resize', updateInteractionGeometry);
    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(updateInteractionGeometry);
        observer.observe(roomStage);
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }
    requiredElement('private-room-logout').addEventListener('click', async () => {
        try { await fetch('/api/private-room-access/logout', { method: 'POST', credentials: 'same-origin' }); }
        finally { location.assign('index.html'); }
    });
    window.addEventListener('pagehide', () => {
        destroyMedia();
        window.clearInterval(interactionTimer);
        window.clearInterval(roomTimer);
    }, { once: true });
}

function renderSupportMaterial(room, { preserveVisibility = false } = {}) {
    const previousVisible = preserveVisibility ? materialVisible : true;
    const existing = player.querySelector('.private-room-material-panel');
    existing?.remove();
    currentMaterialSignature = materialSignature(room);
    if (!room.supportMaterialEnabled || !room.supportMaterialUrl) {
        materialToggle.classList.add('hidden');
        materialToggle.removeAttribute('aria-pressed');
        return;
    }

    materialVisible = previousVisible;
    const panel = element('aside', {
        className: 'private-room-material-panel',
        attributes: { 'aria-label': room.supportMaterialTitle || 'Material de apoio' },
    });
    panel.dataset.materialIdentity = materialIdentity(room);
    const materialUrl = supportMaterialDisplayUrl(room);
    const header = element('div', { className: 'private-room-material-header' });
    const openLink = element('a', {
        title: 'Abrir material em nova aba',
        attributes: { href: materialUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir material em nova aba', 'data-material-open': 'true' },
    });
    openLink.append(icon('fa-solid fa-arrow-up-right-from-square'));
    const fullscreenButton = element('button', { title: 'Tela cheia', attributes: { type: 'button', 'aria-label': 'Tela cheia do material' } });
    fullscreenButton.append(icon('fa-solid fa-expand'));
    fullscreenButton.addEventListener('click', () => toggleSupportMaterialFullscreen(panel));
    const closeButton = element('button', { title: 'Ocultar material', attributes: { type: 'button', 'aria-label': 'Ocultar material' } });
    closeButton.append(icon('fa-solid fa-xmark'));
    closeButton.addEventListener('click', () => setSupportMaterialVisible(false));
    header.append(element('strong', { text: room.supportMaterialTitle || 'Material de apoio' }), openLink, fullscreenButton, closeButton);
    panel.append(header, renderSupportMaterialBody(room));
    player.append(panel);
    materialToggle.classList.remove('hidden');
    setSupportMaterialVisible(previousVisible);
}

function updateSupportMaterialInPlace(room) {
    const panel = player.querySelector('.private-room-material-panel');
    if (!panel || panel.dataset.materialIdentity !== materialIdentity(room)) return false;
    const materialUrl = supportMaterialDisplayUrl(room);
    panel.querySelector('[data-material-open]')?.setAttribute('href', materialUrl);
    const frame = panel.querySelector('iframe');
    if (frame && frame.getAttribute('src') !== materialUrl) frame.setAttribute('src', materialUrl);
    currentMaterialSignature = materialSignature(room);
    return true;
}

function renderSupportMaterialBody(room) {
    const body = element('div', { className: 'private-room-material-body' });
    const materialUrl = supportMaterialDisplayUrl(room);
    if (room.supportMaterialType === 'image') {
        body.append(element('img', { attributes: { src: materialUrl, alt: room.supportMaterialTitle || 'Material de apoio', loading: 'lazy' } }));
        return body;
    }

    const frame = element('iframe', {
        attributes: {
            title: room.supportMaterialTitle || 'Material de apoio',
            src: materialUrl,
            referrerpolicy: 'strict-origin-when-cross-origin',
            loading: 'lazy',
        },
    });
    body.append(frame);
    const fallback = element('div', { className: 'private-room-material-fallback hidden' });
    const fallbackLink = element('a', {
        className: 'private-room-action',
        text: 'Abrir material',
        attributes: { href: materialUrl, target: '_blank', rel: 'noopener noreferrer' },
    });
    fallback.prepend(icon('fa-solid fa-file-lines'));
    fallback.append(element('p', { text: 'Se o material não abrir aqui, use o botão abaixo.' }), fallbackLink);
    body.append(fallback);
    return body;
}

function toggleSupportMaterial() {
    setSupportMaterialVisible(!materialVisible);
}

function setSupportMaterialVisible(visible) {
    materialVisible = visible;
    const panel = player.querySelector('.private-room-material-panel');
    panel?.classList.toggle('hidden', !visible);
    materialToggle.setAttribute('aria-pressed', String(visible));
    materialToggle.replaceChildren(
        icon(visible ? 'fa-solid fa-file-circle-xmark' : 'fa-solid fa-file-lines'),
        document.createTextNode(visible ? ' Ocultar material' : ' Abrir material'),
    );
}

async function toggleSupportMaterialFullscreen(panel) {
    if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
        return;
    }
    await panel.requestFullscreen?.().catch(() => undefined);
}

function supportMaterialDisplayUrl(room) {
    if (room.supportMaterialType !== 'pdf') return room.supportMaterialUrl;
    const page = Math.max(1, Number.parseInt(room.supportMaterialCurrentPage, 10) || 1);
    const [baseUrl] = room.supportMaterialUrl.split('#');
    return `${baseUrl}#page=${page}&toolbar=0&navpanes=0`;
}

function roomSourceSignature(room) {
    return [room.title, room.description, room.sourceType, room.sourceUrl].join('|');
}

function materialSignature(room) {
    return [
        room.supportMaterialEnabled,
        room.supportMaterialTitle,
        room.supportMaterialType,
        room.supportMaterialUrl,
        room.supportMaterialCurrentPage,
    ].join('|');
}

function materialIdentity(room) {
    return [
        room.supportMaterialEnabled,
        room.supportMaterialTitle,
        room.supportMaterialType,
        room.supportMaterialUrl,
    ].join('|');
}

async function loadInteraction(roomCode) {
    if (!roomCode) return;
    try {
        const response = await fetch(`/api/private-room-access/${encodeURIComponent(roomCode)}/interaction`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || 'Não foi possível carregar a interação.');
        renderInteraction(payload);
    } catch {
        currentInteractionSettings = null;
        forumToggle.classList.add('hidden');
        setInteractionVisible(false);
    }
}

function renderInteraction(payload) {
    const settings = payload.settings;
    currentInteractionSettings = settings;
    if (!settings?.enabled) {
        forumToggle.classList.add('hidden');
        setInteractionVisible(false);
        return;
    }

    forumToggle.classList.remove('hidden');
    setInteractionVisible(interactionVisible);
    requiredElement('private-room-interaction-notice').textContent = settings.noticeText || 'Envie suas perguntas e comentários para a moderação.';
    configureInteractionForm(settings);
    renderHighlightedMessage(payload.highlightedMessage, settings);
    renderApprovedMessages(payload.messages || [], settings);
}

function setInteractionVisible(visible) {
    interactionVisible = Boolean(visible && currentInteractionSettings?.enabled);
    document.body.classList.toggle('private-room-forum-open', interactionVisible);
    if (interactionVisible) {
        updateInteractionGeometry();
    } else {
        document.body.classList.remove('private-room-forum-docked', 'private-room-forum-narrow');
        document.documentElement.style.setProperty('--private-room-video-shift', '0px');
    }
    interactionSection.classList.toggle('hidden', !interactionVisible);
    forumToggle.classList.toggle('is-open', interactionVisible);
    forumToggle.setAttribute('aria-expanded', String(interactionVisible));
    forumToggle.setAttribute('aria-label', interactionVisible ? 'Minimizar fórum' : 'Abrir fórum');
    forumToggle.title = interactionVisible ? 'Minimizar fórum' : 'Abrir fórum';
    forumToggle.replaceChildren(
        icon(interactionVisible ? 'fa-solid fa-minus' : 'fa-regular fa-comments'),
    );
}

function updateInteractionGeometry() {
    if (!interactionVisible || !roomMain) return;
    const mainRect = roomMain.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = viewportWidth <= 860 ? 8 : 12;
    const gap = viewportWidth <= 1100 ? 8 : 12;
    const closedLeft = mainRect.left + roomStage.offsetLeft;
    const closedTop = mainRect.top + roomStage.offsetTop;
    const stageWidth = roomStage.offsetWidth;
    const stageHeight = roomStage.offsetHeight;
    const maxShift = Math.max(0, mainRect.right - (closedLeft + stageWidth));
    const shift = viewportWidth > 860 ? Math.min(220, maxShift) : 0;
    const openLeft = closedLeft + shift;
    const availablePanelWidth = openLeft - margin - gap;
    const docked = viewportWidth > 860 && availablePanelWidth >= 180;
    const width = docked
        ? Math.min(360, availablePanelWidth)
        : Math.min(430, viewportWidth - (margin * 2));
    const left = docked
        ? margin
        : margin;
    const top = docked
        ? Math.max(margin, closedTop)
        : Math.max(margin, Math.min(closedTop, viewportHeight * .14));
    const height = docked
        ? Math.max(320, Math.min(stageHeight, viewportHeight - top - margin))
        : Math.max(320, viewportHeight - top - margin - 56);

    document.documentElement.style.setProperty('--private-room-forum-left', `${left}px`);
    document.documentElement.style.setProperty('--private-room-forum-top', `${top}px`);
    document.documentElement.style.setProperty('--private-room-forum-width', `${width}px`);
    document.documentElement.style.setProperty('--private-room-forum-height', `${height}px`);
    document.documentElement.style.setProperty('--private-room-video-shift', `${docked ? shift : 0}px`);
    document.body.classList.toggle('private-room-forum-docked', docked);
    document.body.classList.toggle('private-room-forum-narrow', docked && width < 260);
}

function configureInteractionForm(settings) {
    const nameRequired = settings.requireName && !settings.allowAnonymous;
    requiredElement('private-room-name-field').classList.remove('hidden');
    participantNameInput.required = nameRequired;
    participantNameInput.placeholder = nameRequired ? 'Seu nome' : 'Nome opcional';
    requiredElement('private-room-name-field').querySelector('label').textContent = nameRequired ? 'Nome' : 'Nome opcional';
    requiredElement('private-room-contact-field').classList.toggle('hidden', !settings.collectContact);
    participantContactInput.required = false;

    const label = settings.mode === 'questions_only'
        ? 'Pergunta'
        : settings.mode === 'comments_only'
            ? 'Comentário'
            : 'Mensagem';
    requiredElement('private-room-message-label').textContent = label;
    messageBodyInput.placeholder = settings.mode === 'questions_only'
        ? 'Escreva sua pergunta'
        : settings.mode === 'comments_only'
            ? 'Escreva seu comentário'
            : 'Escreva sua pergunta ou comentário';
}

function renderHighlightedMessage(message, settings) {
    const highlight = requiredElement('private-room-highlight');
    if (!message) {
        highlight.classList.add('hidden');
        return;
    }
    requiredElement('private-room-highlight-author').textContent = message.participantName || 'Anônimo';
    requiredElement('private-room-highlight-body').textContent = message.body;
    const reply = requiredElement('private-room-highlight-reply');
    if (settings.allowPublicReplies && message.adminReply) {
        reply.textContent = `Resposta: ${message.adminReply}`;
        reply.classList.remove('hidden');
    } else {
        reply.classList.add('hidden');
    }
    highlight.classList.remove('hidden');
}

function renderApprovedMessages(messages, settings) {
    clear(approvedMessages);
    if (!messages.length) {
        approvedMessages.append(element('div', { className: 'private-room-empty', text: 'Nenhuma mensagem aprovada ainda.' }));
        return;
    }
    messages.forEach((message) => approvedMessages.append(renderPublicMessage(message, settings)));
}

function renderPublicMessage(message, settings) {
    const card = element('article', { className: `private-room-message-card${message.isHighlighted ? ' highlighted' : ''}` });
    const header = element('header');
    header.append(
        element('strong', { text: message.participantName || 'Anônimo' }),
        element('time', { text: formatPublicTime(message.createdAt) }),
    );
    card.append(header, element('p', { text: message.body }));
    if (settings.allowPublicReplies && message.adminReply) {
        card.append(element('div', { className: 'private-room-admin-reply', text: `Resposta: ${message.adminReply}` }));
    }
    return card;
}

async function submitInteractionMessage(event) {
    event.preventDefault();
    if (!activeRoomCode || !currentInteractionSettings?.enabled) return;
    interactionStatus.textContent = '';
    interactionStatus.classList.remove('error');
    messageSubmitButton.disabled = true;
    try {
        const response = await fetch(`/api/private-room-access/${encodeURIComponent(activeRoomCode)}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                participantName: participantNameInput.value,
                participantContact: participantContactInput.value,
                body: messageBodyInput.value,
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || 'Não foi possível enviar a mensagem.');
        messageBodyInput.value = '';
        if (!currentInteractionSettings.collectContact) participantContactInput.value = '';
        interactionStatus.textContent = payload.moderated ? 'Mensagem enviada para moderação.' : 'Mensagem publicada.';
        await loadInteraction(activeRoomCode);
    } catch (error) {
        interactionStatus.textContent = error.message;
        interactionStatus.classList.add('error');
    } finally {
        messageSubmitButton.disabled = false;
    }
}

function formatPublicTime(value) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function togglePlayback() {
    if (youtubeFrame) {
        youtubePlaying = !youtubePlaying;
        sendYouTubeCommand(youtubePlaying ? 'playVideo' : 'pauseVideo');
        updateButtons();
        return;
    }
    if (!media) return;
    if (media.paused) media.play().catch(() => undefined);
    else media.pause();
    updateButtons();
}

function toggleVolume() {
    muted = !muted;
    if (youtubeFrame) {
        sendYouTubeCommand(muted ? 'mute' : 'unMute');
        if (!muted) sendYouTubeCommand('setVolume', [75]);
    }
    if (media) {
        media.muted = muted;
        if (!muted && media.volume === 0) media.volume = .7;
    }
    updateButtons();
}

function updateButtons() {
    const playing = youtubeFrame ? youtubePlaying : media && !media.paused;
    const playLabel = playing ? 'Pausar' : 'Reproduzir';
    const volumeLabel = muted ? 'Ativar som' : 'Silenciar';
    playButton.replaceChildren(icon(playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'));
    volumeButton.replaceChildren(icon(muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'));
    playButton.setAttribute('aria-label', playLabel);
    playButton.title = playLabel;
    volumeButton.setAttribute('aria-label', volumeLabel);
    volumeButton.title = volumeLabel;
}

function sendYouTubeCommand(command, args = []) {
    youtubeFrame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command, args }), 'https://www.youtube-nocookie.com');
}

function showMediaControls() {
    playButton.classList.remove('hidden');
    volumeButton.classList.remove('hidden');
    hideExternalLink();
}

function hideExternalLink() {
    externalLink.classList.add('hidden');
    externalLink.removeAttribute('href');
}

function renderAccessError(title, message, roomCode = '') {
    requiredElement('private-room-title').textContent = title;
    requiredElement('private-room-description').textContent = message;
    destroyMedia();
    window.clearInterval(interactionTimer);
    window.clearInterval(roomTimer);
    currentInteractionSettings = null;
    forumToggle.classList.add('hidden');
    setInteractionVisible(false);
    materialToggle.classList.add('hidden');
    clear(player);
    const panel = element('div', { className: 'private-room-frame private-room-error' });
    const retryUrl = `index.html${roomCode ? `?room=${encodeURIComponent(roomCode)}` : ''}`;
    const link = element('a', { className: 'private-room-action', text: 'Voltar e informar senha', attributes: { href: retryUrl } });
    panel.append(icon('fa-solid fa-triangle-exclamation'), element('h2', { text: title }), element('p', { text: message }), link);
    player.append(panel);
    playButton.classList.add('hidden');
    volumeButton.classList.add('hidden');
    hideExternalLink();
}

function normalizeVideoUrl(sourceUrl) {
    return /^https:\/\//i.test(sourceUrl) ? sourceUrl : `/videos/${sourceUrl}`;
}

function destroyMedia() {
    hls?.destroy();
    hls = null;
    media?.pause();
    media = null;
    youtubeFrame = null;
    youtubePlaying = false;
}

window.addEventListener('DOMContentLoaded', initialize, { once: true });
