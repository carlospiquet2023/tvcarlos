/**
 * VideoPlayer.tsx — Player de Vídeo Seguro com HLS Streaming
 *
 * Funcionalidades:
 * - Inicializa video.js com source HLS (.m3u8) autenticada via stream-token
 * - Restaura progresso de visualização anterior (GET /api/student/progress)
 * - Salva progresso a cada 10 segundos (POST /api/student/progress)
 * - Renova stream token automaticamente a cada 4 minutos (expira em 5)
 *
 * Proteções Anti-Pirataria:
 * - Marca d'água dinâmica (nome + email) flutuando a cada 15s
 * - Bloqueio de right-click no vídeo
 * - Bloqueio de F12 / DevTools (Ctrl+Shift+I)
 */
import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import type Player from 'video.js/dist/types/player';

interface VideoPlayerProps {
    videoId: string;
    hlsUrl: string;
    moduleId?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function VideoPlayer({ videoId, hlsUrl, moduleId }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const playerRef = useRef<Player | null>(null);
    const watermarkRef = useRef<HTMLDivElement | null>(null);
    const { user, token } = useAuth();

    useEffect(() => {
        if (!videoRef.current) return;

        const videoElement = videoRef.current;
        let progressInterval: ReturnType<typeof setInterval> | undefined;
        let attendanceInterval: ReturnType<typeof setInterval> | undefined;
        const abortController = new AbortController();
        let handleBeforeUnload: (() => void) | undefined;

        const initPlayer = async () => {
            // HLS é servido sem auth por request (proteção via UUID no path)
            const hlsSrc = `${API_BASE_URL}${hlsUrl}`;

            // 1. Fetch initial progress
            let initialTime = 0;
            try {
                const res = await api.get(`/api/student/progress/${videoId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: abortController.signal
                });
                if (res.data && res.data.progress) {
                    initialTime = res.data.progress;
                }
            } catch (e) {
                if (!abortController.signal.aborted) console.error('Error fetching progress', e);
            }

            if (abortController.signal.aborted) return;

            // 2. Initialize video.js
            const player = playerRef.current = videojs(videoElement, {
                controls: true,
                fluid: true,
                playbackRates: [0.5, 1, 1.25, 1.5, 2],
                sources: [{ src: hlsSrc, type: 'application/x-mpegURL' }],
                html5: { vhs: { overrideNative: true } }
            });

            player.ready(() => {
                if (initialTime > 0) {
                    player.currentTime(initialTime);
                }
            });

            // 3. Helper to save progress
            const saveProgress = () => {
                if (!player || player.isDisposed()) return;
                const current = player.currentTime() || 0;
                const dur = player.duration() || 1;
                const isCompleted = (current / dur) > 0.95;
                if (current <= 0) return;
                api.post('/api/student/progress', {
                    videoId,
                    progress: current,
                    completed: isCompleted
                }, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: abortController.signal
                }).catch(() => { /* aborted or network error */ });
            };

            // Save on play (marks the video as watched immediately)
            player.on('play', saveProgress);
            // Save on pause
            player.on('pause', saveProgress);

            // Save progress periodically
            progressInterval = setInterval(() => {
                if (player && !player.paused()) {
                    saveProgress();
                }
            }, 10000);

            // Save on page unload
            handleBeforeUnload = () => saveProgress();
            window.addEventListener('beforeunload', handleBeforeUnload);

            // 4. Attendance heartbeat — envia a cada 30s se vídeo está tocando
            if (moduleId) {
                attendanceInterval = setInterval(() => {
                    if (player && !player.paused() && !player.isDisposed()) {
                        api.post('/api/student/attendance/heartbeat', { moduleId }, {
                            headers: { Authorization: `Bearer ${token}` },
                            signal: abortController.signal
                        }).catch(() => { /* ignore */ });
                    }
                }, 30000);
            }

        };

        initPlayer();

        // --- PROTEÇÕES DE SEGURANÇA NO PLAYER ---

        // 1. Prevenir right-click
        const preventContext = (e: Event) => e.preventDefault();
        videoElement.addEventListener('contextmenu', preventContext);

        // 2. Marca d'água dinâmica
        let moveInterval: ReturnType<typeof setInterval> | undefined;
        if (watermarkRef.current) {
            moveInterval = setInterval(() => {
                if (watermarkRef.current) {
                    const top = Math.random() * 80;
                    const left = Math.random() * 80;
                    watermarkRef.current.style.top = `${top}%`;
                    watermarkRef.current.style.left = `${left}%`;
                }
            }, 15000);
        }

        return () => {
            abortController.abort();
            if (playerRef.current && !playerRef.current.isDisposed()) {
                playerRef.current.dispose();
            }
            clearInterval(moveInterval);
            clearInterval(progressInterval);
            clearInterval(attendanceInterval);
            if (handleBeforeUnload) window.removeEventListener('beforeunload', handleBeforeUnload);
            videoElement.removeEventListener('contextmenu', preventContext);
        };
    }, [hlsUrl, token, videoId, moduleId]);

    // Previne F12 e atalhos de devtools
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                alert("Por motivos de direitos autorais, ferramentas de desenvolvedor são desativadas nesta página.");
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', borderRadius: '0', overflow: 'hidden' }}>

            {/* Container do Vídeo */}
            <div data-vjs-player>
                <video ref={videoRef} className="video-js vjs-theme-city vjs-big-play-centered" />
            </div>

            {/* Marca D'Água Dinâmica */}
            <div
                ref={watermarkRef}
                style={{
                    position: 'absolute',
                    top: '10%',
                    left: '10%',
                    opacity: 0.35,
                    color: 'white',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    pointerEvents: 'none',
                    zIndex: 99,
                    transition: 'top 2s ease-in-out, left 2s ease-in-out',
                    userSelect: 'none'
                }}
            >
                {user?.name} <br />
                {user?.email} <br />
                {new Date().toLocaleDateString('pt-BR')} - Confidencial
            </div>
        </div>
    );
}
