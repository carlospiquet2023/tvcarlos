import './js/client-guard.js';
import { clear, element, icon, requiredElement } from './js/dom.js';
import { buildYouTubeEmbedUrl } from './js/media-source.js';
import { createBrandingController } from './js/public/branding-controller.js';
import { STREAMS } from './js/public/config.js';
import { createBroadcastState } from './js/public/state.js';

const state = createBroadcastState();
const branding = createBrandingController({ state, onBrandingChange: () => undefined });
const player = requiredElement('private-room-player');
const playButton = requiredElement('private-room-play');
const volumeButton = requiredElement('private-room-volume');
const externalLink = requiredElement('private-room-external-link');

let hls = null;
let media = null;
let youtubeFrame = null;
let youtubePlaying = false;
let muted = true;

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
        renderRoom(room);
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
    requiredElement('private-room-title').textContent = room.title;
    requiredElement('private-room-description').textContent = room.description || 'Conteúdo privado liberado para esta sessão.';
    document.title = `${room.title} · Sala Privada · TV Carlos`;
    destroyMedia();
    hideExternalLink();

    if (room.sourceType === 'external') {
        renderExternal(room);
        return;
    }

    const youtubeUrl = room.sourceType === 'youtube' ? buildYouTubeEmbedUrl(room.sourceUrl) : buildYouTubeEmbedUrl(room.sourceUrl);
    if (youtubeUrl) {
        renderYouTube(youtubeUrl, room.title);
        return;
    }

    renderVideo(room.sourceType === 'live' ? STREAMS.live.url : normalizeVideoUrl(room.sourceUrl), room.sourceType === 'live');
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
    requiredElement('private-room-logout').addEventListener('click', async () => {
        try { await fetch('/api/private-room-access/logout', { method: 'POST', credentials: 'same-origin' }); }
        finally { location.assign('index.html'); }
    });
    window.addEventListener('pagehide', destroyMedia, { once: true });
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
    playButton.replaceChildren(icon(playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'), document.createTextNode(playing ? ' Pausar' : ' Reproduzir'));
    volumeButton.replaceChildren(icon(muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'), document.createTextNode(muted ? ' Ativar som' : ' Silenciar'));
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
