import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Radio, RefreshCw } from 'lucide-react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import type { BroadcastSelection } from '../lib/broadcast';
import { safeExternalUrl } from '../lib/broadcast';

interface BroadcastPlayerProps {
    selection: BroadcastSelection;
}

type PlayerState = 'idle' | 'connecting' | 'playing' | 'retrying' | 'error';

function youtubeEmbedUrl(value: string): string {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        let id = '';
        if (host === 'youtu.be' || host === 'www.youtu.be') {
            id = url.pathname.split('/').filter(Boolean)[0] || '';
        } else if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
            const path = url.pathname.split('/').filter(Boolean);
            id = url.searchParams.get('v') || (['embed', 'live', 'shorts'].includes(path[0]) ? path[1] : '') || '';
        }
        if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return '';
        const origin = window.location.origin;
        return `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1&rel=0&origin=${encodeURIComponent(origin)}`;
    } catch {
        return '';
    }
}

export default function BroadcastPlayer({ selection }: BroadcastPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [retryNonce, setRetryNonce] = useState(0);

    useEffect(() => {
        if (!videoRef.current || !selection.url || !['hls', 'video'].includes(selection.kind)) {
            setPlayerState(selection.url ? 'idle' : 'error');
            return;
        }

        const element = videoRef.current;
        let player: Player | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let retryCount = 0;
        let disposed = false;

        const connect = () => {
            if (!player || disposed) return;
            const activePlayer = player;
            setPlayerState(retryCount > 0 ? 'retrying' : 'connecting');
            activePlayer.src({
                src: selection.url,
                type: selection.kind === 'hls' ? 'application/x-mpegURL' : 'video/mp4',
            });
            activePlayer.load();
            const playRequest = activePlayer.play();
            if (playRequest) void playRequest.catch(() => undefined);
        };

        const scheduleRecovery = () => {
            if (!player || disposed || retryTimer) return;
            retryCount += 1;
            if (retryCount > 5) {
                setPlayerState('error');
                return;
            }
            setPlayerState('retrying');
            retryTimer = setTimeout(() => {
                retryTimer = undefined;
                connect();
            }, Math.min(16_000, 1_500 * (2 ** (retryCount - 1))));
        };

        setPlayerState('connecting');
        player = videojs(element, {
            autoplay: 'muted',
            controls: true,
            fluid: true,
            liveui: selection.mode === 'live',
            muted: true,
            poster: selection.posterUrl || undefined,
            preload: 'auto',
            responsive: true,
            sources: [{
                src: selection.url,
                type: selection.kind === 'hls' ? 'application/x-mpegURL' : 'video/mp4',
            }],
            html5: {
                vhs: {
                    overrideNative: true,
                    smoothQualityChange: true,
                },
            },
        });

        player.on('playing', () => {
            retryCount = 0;
            setPlayerState('playing');
        });
        player.on('waiting', () => setPlayerState((current) => current === 'playing' ? 'connecting' : current));
        player.on('error', scheduleRecovery);

        return () => {
            disposed = true;
            clearTimeout(retryTimer);
            if (player && !player.isDisposed()) player.dispose();
            player = null;
        };
    }, [selection.kind, selection.mode, selection.posterUrl, selection.url, retryNonce]);

    const youtubeUrl = selection.kind === 'youtube' ? youtubeEmbedUrl(selection.url) : '';
    const externalUrl = selection.kind === 'external' ? safeExternalUrl(selection.url) : '';

    return (
        <div className="campus-player-shell">
            {selection.kind === 'youtube' && youtubeUrl ? (
                <iframe
                    className="campus-youtube-frame"
                    src={youtubeUrl}
                    title={selection.title}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                />
            ) : ['hls', 'video'].includes(selection.kind) && selection.url ? (
                <div data-vjs-player className="campus-video-host">
                    <video ref={videoRef} className="video-js vjs-big-play-centered" playsInline />
                </div>
            ) : externalUrl ? (
                <div className="campus-player-fallback">
                    <ExternalLink size={34} aria-hidden="true" />
                    <h2>Conteúdo em plataforma parceira</h2>
                    <p>Este item será aberto com segurança em uma nova aba.</p>
                    <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                        Abrir transmissão <ExternalLink size={16} aria-hidden="true" />
                    </a>
                </div>
            ) : (
                <div className="campus-player-fallback">
                    <Radio size={36} aria-hidden="true" />
                    <h2>Sinal em preparação</h2>
                    <p>A programação volta automaticamente assim que a transmissão estiver disponível.</p>
                </div>
            )}

            {['connecting', 'retrying'].includes(playerState) && ['hls', 'video'].includes(selection.kind) && (
                <div className="campus-player-status" role="status" aria-live="polite">
                    <Loader2 className="spinner" size={18} aria-hidden="true" />
                    {playerState === 'retrying' ? 'Reconectando ao sinal…' : 'Conectando ao sinal…'}
                </div>
            )}

            {playerState === 'error' && selection.url && ['hls', 'video'].includes(selection.kind) && (
                <div className="campus-player-error" role="alert">
                    <AlertCircle size={20} aria-hidden="true" />
                    <span>O sinal oscilou. Você pode tentar novamente.</span>
                    <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
                        <RefreshCw size={15} aria-hidden="true" /> Tentar novamente
                    </button>
                </div>
            )}

            <div className="campus-player-watermark" aria-hidden="true">CAMPUS • CONTEÚDO EDUCACIONAL</div>
        </div>
    );
}
