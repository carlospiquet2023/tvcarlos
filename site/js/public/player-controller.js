import { element, icon, requiredElement } from '../dom.js';
import { buildYouTubeEmbedUrl } from '../media-source.js';
import { STREAMS } from './config.js';
import { isOnDemand } from './state.js';
import { withCacheBuster } from './request.js';

export function createPlayerController({ state, onPlaybackChange }) {
    const video = requiredElement('tv-player');
    const wrapper = document.querySelector('.player-wrapper');
    if (!wrapper) throw new Error('Elemento obrigatório ausente: .player-wrapper');
    const youtube = requiredElement('youtube-player');
    const youtubeTray = requiredElement('youtube-control-tray');
    const youtubeControl = requiredElement('youtube-overlay-control');
    const youtubeVolumeControl = requiredElement('youtube-volume-control');
    const statusBadge = requiredElement('status-badge');
    const statusText = requiredElement('status-text');
    const progressContainer = requiredElement('progress-container');
    const sourceLabel = requiredElement('player-source-label');
    const modeLabel = requiredElement('player-mode-label');
    let hls = null;
    let youtubePlaying = false;
    let youtubeMuted = false;
    let unavailableYouTubeLiveUrl = '';

    function initialize() {
        bindControls();
        requiredElement('video-protection-overlay').addEventListener('click', (event) => {
            if (event.target instanceof Element && event.target.closest('.youtube-control-tray')) return;
            togglePlayback();
        });
        youtubeControl.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePlayback();
        });
        youtubeVolumeControl.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleYouTubeMute();
        });
        const youtubeFullscreenControl = document.getElementById('youtube-fullscreen-control');
        if (youtubeFullscreenControl) {
            youtubeFullscreenControl.addEventListener('click', (event) => {
                event.stopPropagation();
                document.fullscreenElement ? document.exitFullscreen() : wrapper.requestFullscreen();
            });
        }
        youtube.addEventListener('load', () => {
            if (!isYouTubeSource()) return;
            sendYouTubeCommand(youtubeMuted ? 'mute' : 'unMute');
            if (youtubePlaying) sendYouTubeCommand('playVideo');
        });
        window.addEventListener('message', handleYouTubeMessage);
    }

    function playHls(sourceType, { force = false } = {}) {
        if (!STREAMS[sourceType]) throw new Error(`Fonte HLS desconhecida: ${sourceType}`);
        if (state.currentSource === sourceType && !force) {
            refreshPresentation();
            return;
        }
        const stream = STREAMS[sourceType];
        deactivateYouTube();
        destroyHls();
        state.currentSource = sourceType;
        state.activeProgram = null;
        video.loop = false;
        progressContainer.classList.add('hidden');
        updateRail(sourceType);
        refreshPresentation();
        onPlaybackChange();

        const HlsLibrary = window.Hls;
        if (HlsLibrary?.isSupported()) {
            hls = new HlsLibrary({
                maxLiveSyncPlaybackRate: 1.5,
                liveSyncDurationCount: 3,
                manifestLoadingMaxRetry: 5,
                manifestLoadingRetryDelay: 1_000,
            });
            hls.loadSource(stream.url);
            hls.attachMedia(video);
            hls.on(HlsLibrary.Events.MANIFEST_PARSED, safePlay);
            hls.on(HlsLibrary.Events.LEVEL_UPDATED, () => synchronizeLiveEdge(sourceType));
            hls.on(HlsLibrary.Events.ERROR, (_event, data) => recoverHlsError(sourceType, data, HlsLibrary));
            return;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = stream.url;
            video.onloadedmetadata = safePlay;
            return;
        }
        showPlayerFailure('Este navegador não oferece suporte a HLS.');
    }

    function playProgram(program) {
        const embedUrl = buildYouTubeEmbedUrl(program.video);
        if (embedUrl) return playYouTube(program, embedUrl);
        destroyHls();
        deactivateYouTube();
        state.currentSource = 'vod';
        state.activeProgram = program;
        video.loop = true;
        video.src = /^(https?:\/\/|\/?videos\/)/i.test(program.video) ? program.video : `/videos/${program.video}`;
        video.load();
        safePlay();
        progressContainer.classList.remove('hidden');
        updateRail('vod');
        refreshPresentation();
        onPlaybackChange();
    }

    function playYouTubeLive(embedUrl) {
        if (state.currentSource === 'youtube-live' && youtube.src === embedUrl) {
            refreshPresentation();
            return;
        }
        destroyHls();
        state.currentSource = 'youtube-live';
        state.activeProgram = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.loop = false;
        youtube.src = embedUrl;
        youtube.title = `YouTube Live — ${state.branding.liveTitle}`;
        youtube.classList.remove('hidden');
        wrapper.classList.add('youtube-active');
        youtubePlaying = false;
        youtubeMuted = false;
        youtubeTray.classList.remove('hidden');
        updateYouTubeControl();
        updateYouTubeVolumeControl();
        progressContainer.classList.add('hidden');
        updateRail('youtube-live');
        refreshPresentation();
        onPlaybackChange();
    }

    function playYouTube(program, embedUrl) {
        destroyHls();
        state.currentSource = 'youtube';
        state.activeProgram = program;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.loop = false;
        youtube.src = embedUrl;
        youtube.title = `YouTube — ${program.title}`;
        youtube.classList.remove('hidden');
        wrapper.classList.add('youtube-active');
        youtubePlaying = false;
        youtubeMuted = false;
        youtubeTray.classList.remove('hidden');
        updateYouTubeControl();
        updateYouTubeVolumeControl();
        progressContainer.classList.add('hidden');
        updateRail('youtube');
        refreshPresentation();
        onPlaybackChange();
    }

    async function returnToLinear() {
        if (!isOnDemand(state)) {
            if (state.currentSource === 'live' && hls?.liveSyncPosition) video.currentTime = hls.liveSyncPosition;
            if (state.currentSource === 'loop' || state.currentSource === 'offline') await checkLive();
            return;
        }
        deactivateYouTube();
        state.currentSource = null;
        state.activeProgram = null;
        video.loop = false;
        progressContainer.classList.add('hidden');
        await checkLive();
    }

    async function checkLive() {
        const liveYouTubeUrl = getLiveYouTubeEmbedUrl();

        if (liveYouTubeUrl) {
            state.isLiveOnline = true;
            if (!isOnDemand(state)) playYouTubeLive(liveYouTubeUrl);
            onPlaybackChange();
            return true;
        }

        const streamStatus = await probeStreamStatus();
        const online = state.branding.liveSource === 'obs' && streamStatus.live;
        state.isLiveOnline = online;
        if (!isOnDemand(state)) {
            if (online) playHls('live');
            else if (streamStatus.loop) playHls('loop');
            else showOfflineSignal();
        }
        onPlaybackChange();
        return online;
    }

    function refreshPresentation() {
        const source = state.currentSource;
        if (source === 'live' || source === 'loop') {
            const stream = STREAMS[source];
            statusBadge.className = `badge ${stream.badgeClass}`;
            statusText.textContent = stream.badgeText;
            updateNowPlaying(
                source === 'live' ? 'TRANSMISSÃO AO VIVO' : 'NO AR AGORA',
                source === 'live' ? state.branding.liveTitle : state.branding.loopTitle,
                source === 'live' ? state.branding.liveDescription : state.branding.loopDescription,
            );
        } else if (source === 'vod' && state.activeProgram) {
            statusBadge.className = 'badge badge-vod';
            statusText.textContent = 'SOB DEMANDA';
            updateNowPlaying('SOB DEMANDA', state.activeProgram.title, programDescription('Conteúdo da TV Carlos.'));
        } else if (source === 'youtube' && state.activeProgram) {
            statusBadge.className = 'badge badge-youtube';
            statusText.textContent = 'YOUTUBE';
            updateNowPlaying('CONTEÚDO COMPLEMENTAR', state.activeProgram.title, programDescription('Vídeo do YouTube.'));
        } else if (source === 'youtube-live') {
            statusBadge.className = 'badge badge-live';
            statusText.textContent = 'AO VIVO';
            updateNowPlaying('TRANSMISSÃO AO VIVO', state.branding.liveTitle, state.branding.liveDescription);
        } else if (source === 'offline') {
            statusBadge.className = 'badge badge-recorded';
            statusText.textContent = 'SEM SINAL';
            updateNowPlaying('SINAL INDISPONÍVEL', 'Nenhum sinal disponível', 'A transmissão será retomada assim que o sinal ao vivo ou a programação 24h estiverem disponíveis.');
        }
    }

    function programDescription(fallback) {
        return state.activeProgram?.description || state.activeProgram?.desc || fallback;
    }

    function updateNowPlaying(label, title, description) {
        requiredElement('current-program-label').textContent = label;
        requiredElement('current-program-title').textContent = title;
        requiredElement('current-program-description').textContent = description;
    }

    function updateRail(sourceType) {
        const labels = {
            live: ['SINAL AO VIVO', 'TEMPO REAL'], loop: ['PROGRAMAÇÃO 24H', 'FLUXO CONTÍNUO'],
            vod: ['VÍDEO SELECIONADO', 'SOB DEMANDA'], youtube: ['VÍDEO DO YOUTUBE', 'CONTEÚDO EXTERNO'],
            'youtube-live': ['SINAL AO VIVO', 'YOUTUBE LIVE'], offline: ['SINAL INDISPONÍVEL', 'AGUARDANDO FONTE'],
        };
        [sourceLabel.textContent, modeLabel.textContent] = labels[sourceType] || labels.loop;
    }

    async function probeStreamStatus() {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4_000);
        try {
            const response = await fetch(withCacheBuster('/api/stream/status'), { cache: 'no-store', signal: controller.signal });
            const payload = response.ok ? await response.json() : {};
            return { live: Boolean(payload.live), loop: Boolean(payload.loop) };
        } catch {
            return { live: false, loop: false };
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function showOfflineSignal() {
        destroyHls();
        deactivateYouTube();
        state.currentSource = 'offline';
        state.activeProgram = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.loop = false;
        progressContainer.classList.add('hidden');
        updateRail('offline');
        refreshPresentation();
    }

    function getLiveYouTubeEmbedUrl() {
        if (state.branding.liveSource !== 'youtube') return null;
        const liveUrl = state.branding.liveYoutubeUrl?.trim() || '';
        if (!liveUrl || liveUrl === unavailableYouTubeLiveUrl) return null;
        return buildYouTubeEmbedUrl(liveUrl);
    }

    function handleYouTubeMessage(event) {
        if (!['https://www.youtube-nocookie.com', 'https://www.youtube.com'].includes(event.origin)) return;
        const data = parseYouTubeMessage(event.data);
        if (!data || state.currentSource !== 'youtube-live') return;
        if (data.event === 'onError' || (data.event === 'onStateChange' && Number(data.info) === 0)) {
            markYouTubeLiveUnavailable();
        }
    }

    function parseYouTubeMessage(data) {
        if (typeof data === 'object' && data !== null) return data;
        if (typeof data !== 'string' || !data.startsWith('{')) return null;
        try { return JSON.parse(data); } catch { return null; }
    }

    function markYouTubeLiveUnavailable() {
        unavailableYouTubeLiveUrl = state.branding.liveYoutubeUrl?.trim() || '';
        state.isLiveOnline = false;
        deactivateYouTube();
        playHls('loop', { force: true });
        onPlaybackChange();
    }

    function synchronizeLiveEdge(sourceType) {
        if (sourceType !== 'live' || !hls?.liveSyncPosition) return;
        if (hls.liveSyncPosition - video.currentTime > 6) video.currentTime = hls.liveSyncPosition;
    }

    function recoverHlsError(sourceType, data, HlsLibrary) {
        if (!data.fatal || !hls) return;
        if (data.type === HlsLibrary.ErrorTypes.NETWORK_ERROR) {
            sourceType === 'live' ? void checkLive() : hls.startLoad();
        } else if (data.type === HlsLibrary.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
        } else {
            state.currentSource = null;
            playHls(sourceType === 'live' ? 'loop' : sourceType, { force: true });
        }
    }

    function destroyHls() {
        hls?.destroy();
        hls = null;
    }

    function deactivateYouTube() {
        if (youtube.src && youtube.src !== 'about:blank') youtube.src = 'about:blank';
        youtube.classList.add('hidden');
        wrapper.classList.remove('youtube-active');
        youtubePlaying = false;
        youtubeMuted = false;
        youtubeTray.classList.add('hidden');
    }

    function togglePlayback() {
        if (isYouTubeSource()) {
            youtubePlaying = !youtubePlaying;
            sendYouTubeCommand(youtubePlaying ? 'playVideo' : 'pauseVideo');
            updateYouTubeControl();
        } else {
            video.paused ? safePlay() : video.pause();
        }
    }

    function toggleYouTubeMute() {
        if (!isYouTubeSource()) return;
        youtubeMuted = !youtubeMuted;
        sendYouTubeCommand(youtubeMuted ? 'mute' : 'unMute');
        if (!youtubeMuted) sendYouTubeCommand('setVolume', [75]);
        updateYouTubeVolumeControl();
    }

    function sendYouTubeCommand(command, args = []) {
        youtube.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command, args }), 'https://www.youtube-nocookie.com');
    }

    function isYouTubeSource() {
        return state.currentSource === 'youtube' || state.currentSource === 'youtube-live';
    }

    function updateYouTubeControl() {
        const label = youtubePlaying ? 'Pausar' : 'Reproduzir';
        youtubeControl.setAttribute('aria-label', label);
        youtubeControl.replaceChildren(icon(youtubePlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'), element('span', { text: label }));
    }

    function updateYouTubeVolumeControl() {
        const label = youtubeMuted ? 'Ativar som' : 'Silenciar';
        youtubeVolumeControl.setAttribute('aria-label', label);
        youtubeVolumeControl.setAttribute('title', label);
        youtubeVolumeControl.replaceChildren(icon(youtubeMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'), element('span', { text: label }));
    }

    function bindControls() {
        const play = requiredElement('play-btn');
        const volume = requiredElement('volume-btn');
        const slider = requiredElement('volume-slider');
        const fullscreen = requiredElement('fullscreen-btn');
        const unmute = requiredElement('unmute-banner');
        const progress = requiredElement('progress-bar');
        const time = requiredElement('time-display');
        const updatePlayIcon = () => play.replaceChildren(icon(video.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'));
        const updateVolumeIcon = () => volume.replaceChildren(icon(video.muted || video.volume === 0 ? 'fa-solid fa-volume-xmark' : video.volume < .4 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high'));

        play.addEventListener('click', togglePlayback);
        video.addEventListener('play', updatePlayIcon);
        video.addEventListener('pause', updatePlayIcon);
        unmute.addEventListener('click', () => {
            video.muted = false; video.volume = .5; slider.value = '.5'; unmute.classList.add('hidden'); updateVolumeIcon();
        });
        volume.addEventListener('click', () => {
            video.muted = !video.muted;
            if (!video.muted && video.volume === 0) video.volume = .5;
            slider.value = video.muted ? '0' : String(video.volume);
            if (!video.muted) unmute.classList.add('hidden');
            updateVolumeIcon();
        });
        slider.addEventListener('input', () => {
            video.volume = Number(slider.value); video.muted = video.volume === 0;
            if (!video.muted) unmute.classList.add('hidden');
            updateVolumeIcon();
        });
        fullscreen.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : wrapper.requestFullscreen());
        video.addEventListener('timeupdate', () => {
            if (state.currentSource !== 'vod' || !Number.isFinite(video.duration)) return;
            progress.value = String((video.currentTime / video.duration) * 100);
            time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        });
        progress.addEventListener('input', () => {
            if (state.currentSource === 'vod' && Number.isFinite(video.duration)) video.currentTime = (Number(progress.value) / 100) * video.duration;
        });
    }

    function safePlay() {
        return video.play().catch(() => undefined);
    }

    function showPlayerFailure(message) {
        updateNowPlaying('SINAL INDISPONÍVEL', 'Não foi possível iniciar o player', message);
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds)) return '00:00';
        return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
    }

    function destroy() {
        window.removeEventListener('message', handleYouTubeMessage);
        destroyHls();
        deactivateYouTube();
    }

    return { initialize, playHls, playProgram, returnToLinear, checkLive, refreshPresentation, destroy };
}
