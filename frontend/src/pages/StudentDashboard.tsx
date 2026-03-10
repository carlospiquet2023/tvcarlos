/**
 * StudentDashboard.tsx — Painel do Aluno (Design Premium Produção)
 *
 * Layout com 2 seções tipo carrossel:
 * 1. "Continuar estudando" — Cards grandes com thumbnail + overlay de info
 * 2. "Cursos em Andamento" — Cards médios com thumbnail full + badge de progresso
 *
 * Só mostra cursos em que o aluno está MATRICULADO (pelo admin)
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import {
    LogOut, Search, ShieldCheck, Loader2, ChevronRight,
    ChevronLeft, PlayCircle, BookOpen, GraduationCap, TrendingUp,
    Flag, CheckSquare, Bell, Moon, Sun, Radio, ExternalLink
    // GraduationCap kept for empty state
} from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Video {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    hlsUrl: string;
    status: string;
    order: number;
}

interface Module {
    id: string;
    name: string;
    videos: Video[];
}

interface CourseWithProgress {
    id: string;
    name: string;
    description: string | null;
    thumbnailUrl: string | null;
    modules: Module[];
    progressPercent: number;
    totalVideos: number;
    completedVideos: number;
    lastWatchedVideo: {
        id: string;
        title: string;
        thumbnailUrl: string | null;
        progress: number;
        moduleName: string;
    } | null;
    lastWatchedAt: string | null;
}

export default function StudentDashboard() {
    const { user, token, logout } = useAuth();
    const { config } = useConfig();
    const [courses, setCourses] = useState<CourseWithProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    // Notifications
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifs, setShowNotifs] = useState(false);

    // Dark mode
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

    // Live classes
    const [liveClasses, setLiveClasses] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers = { Authorization: `Bearer ${token}` };
                const [myRes, notifRes, liveRes] = await Promise.all([
                    api.get('/api/student/my-courses', { headers }),
                    api.get('/api/student/notifications', { headers }),
                    api.get('/api/student/my-live-classes', { headers })
                ]);
                setCourses(myRes.data);
                setNotifications(notifRes.data);
                setLiveClasses(liveRes.data);
            } catch (error) {
                console.error('Erro ao buscar cursos', error);
            } finally {
                setLoading(false);
            }
        };
        if (token) fetchData();
    }, [token]);

    // Dark mode toggle
    useEffect(() => {
        document.body.classList.toggle('dark', darkMode);
        localStorage.setItem('darkMode', String(darkMode));
    }, [darkMode]);

    const unreadCount = notifications.filter((n: any) => !n.read).length;

    const handleMarkAllRead = async () => {
        try {
            await api.put('/api/student/notifications/read-all', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch { /* ignore */ }
    };

    const handleLessonClick = (videoId: string) => {
        navigate(`/student/lesson/${videoId}`);
    };

    const handleCourseClick = (course: CourseWithProgress) => {
        if (course.lastWatchedVideo) {
            handleLessonClick(course.lastWatchedVideo.id);
            return;
        }
        // Prefere vídeo READY, mas aceita qualquer um para não bloquear navegação
        const allVideos = course.modules.flatMap(m => m.videos);
        const readyVideo = allVideos.find(v => v.status === 'READY');
        const firstVideo = readyVideo || allVideos[0];
        if (firstVideo) handleLessonClick(firstVideo.id);
    };



    // Cursos em andamento (progresso > 0 e < 100)
    const inProgressCourses = useMemo(() =>
        courses.filter(c => c.progressPercent > 0 && c.progressPercent < 100),
        [courses]
    );

    // Cursos para "Continuar estudando" (que têm lastWatchedVideo)
    const continueCourses = useMemo(() =>
        courses.filter(c => c.lastWatchedVideo !== null)
            .sort((a, b) => {
                const dateA = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
                const dateB = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
                return dateB - dateA;
            }),
        [courses]
    );

    // Progresso global
    const globalProgress = useMemo(() => {
        if (courses.length === 0) return 0;
        const total = courses.reduce((s, c) => s + c.totalVideos, 0);
        const completed = courses.reduce((s, c) => s + c.completedVideos, 0);
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    }, [courses]);

    // Filtro de busca
    const filteredCourses = useMemo(() => {
        if (!searchQuery.trim()) return courses;
        const q = searchQuery.toLowerCase();
        return courses.filter(c => c.name.toLowerCase().includes(q));
    }, [courses, searchQuery]);

    const getThumbUrl = (url: string | null | undefined): string | null => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE}${url}`;
    };

    // Número da aula dentro do curso
    const getLessonNumber = (course: CourseWithProgress): number => {
        if (!course.lastWatchedVideo) return 1;
        let count = 0;
        for (const mod of course.modules) {
            for (const vid of mod.videos) {
                count++;
                if (vid.id === course.lastWatchedVideo.id) return count;
            }
        }
        return 1;
    };

    if (loading) {
        return (
            <div className="sd-loading">
                <Loader2 className="spinner" size={48} color="var(--primary)" />
            </div>
        );
    }

    return (
        <div className="sd-root">
            {/* ===== HEADER ===== */}
            <header className="sd-header">
                <div className="sd-header-left">
                    {config.logoUrl ? (
                        <img src={getThumbUrl(config.logoUrl) || ''} alt={config.platformName} className="sd-logo-img" />
                    ) : (
                        <ShieldCheck size={28} color="var(--primary)" />
                    )}
                    <span className="sd-logo">
                        <span style={{ color: config.nameColor1 }}>{config.namePart1}</span>
                        <span style={{ color: config.nameColor2 }}>{config.namePart2}</span>
                    </span>
                </div>

                <div className="sd-search-bar">
                    <Search size={18} color="var(--text-muted)" />
                    <input
                        type="text"
                        placeholder="Buscar curso..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="sd-header-right">
                    <div className="sd-global-progress">
                        <TrendingUp size={16} />
                        <span>{globalProgress}%</span>
                        <div className="sd-progress-mini">
                            <div className="sd-progress-mini-fill" style={{ width: `${globalProgress}%` }} />
                        </div>
                    </div>

                    {/* Dark mode toggle */}
                    <button onClick={() => setDarkMode(d => !d)} className="sd-icon-btn" title={darkMode ? 'Modo claro' : 'Modo escuro'}>
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    {/* Notifications */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowNotifs(s => !s)} className="sd-icon-btn" title="Notificações">
                            <Bell size={18} />
                            {unreadCount > 0 && <span className="sd-notif-badge">{unreadCount}</span>}
                        </button>
                        {showNotifs && (
                            <div className="sd-notif-dropdown">
                                <div className="sd-notif-header">
                                    <strong>Notificações</strong>
                                    {unreadCount > 0 && (
                                        <button onClick={handleMarkAllRead} className="sd-notif-mark-read">Marcar todas como lidas</button>
                                    )}
                                </div>
                                <div className="sd-notif-list">
                                    {notifications.length === 0 ? (
                                        <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma notificação.</p>
                                    ) : notifications.map((n: any) => (
                                        <div key={n.id} className={`sd-notif-item ${n.read ? '' : 'unread'}`}>
                                            <strong>{n.title}</strong>
                                            <p>{n.message}</p>
                                            <small>{new Date(n.createdAt).toLocaleString('pt-BR')}</small>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="sd-user-area">
                        <div className="sd-avatar">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="sd-user-name">{user?.name}</span>
                        <button onClick={logout} className="sd-logout-btn" title="Sair">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== MAIN ===== */}
            <main className="sd-main">

                {/* ─── BANNER HORIZONTAL ─── */}
                {config.bannerUrl && (
                    <div className="sd-banner">
                        <img
                            src={getThumbUrl(config.bannerUrl) || ''}
                            alt="Banner"
                            className="sd-banner-img"
                        />
                    </div>
                )}

                {/* ─── CONTINUE DE ONDE PAROU ─── */}
                {(() => {
                    const last = continueCourses.length > 0 ? continueCourses[0] : null;
                    // Fallback: se nunca assistiu nada, sugere a primeira aula do primeiro curso
                    if (!last && courses.length > 0) {
                        const firstCourse = courses[0];
                        const allVids = firstCourse.modules.flatMap(m => m.videos);
                        const firstVid = allVids.find(v => v.status === 'READY') || allVids[0];
                        if (firstVid) {
                            const thumbUrl = getThumbUrl(firstCourse.thumbnailUrl);
                            const modName = firstCourse.modules.find(m => m.videos.some(v => v.id === firstVid.id))?.name || 'Módulo';
                            return (
                                <section className="sd-resume-section" onClick={() => handleLessonClick(firstVid.id)}>
                                    <div className="sd-resume-thumb" style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined} />
                                    <div className="sd-resume-overlay">
                                        <span className="sd-resume-label">Comece agora</span>
                                        <h3 className="sd-resume-title">{firstVid.title}</h3>
                                        <div className="sd-resume-meta">
                                            <span className="sd-resume-course">{firstCourse.name}</span>
                                            <span className="sd-resume-sep">•</span>
                                            <span>{modName}</span>
                                            <span className="sd-resume-sep">•</span>
                                            <span>{firstCourse.totalVideos} aulas</span>
                                        </div>
                                    </div>
                                    <div className="sd-resume-play">
                                        <PlayCircle size={36} />
                                    </div>
                                </section>
                            );
                        }
                    }
                    if (!last) return null;
                    const lessonNum = getLessonNumber(last);
                    const thumbUrl = getThumbUrl(last.lastWatchedVideo?.thumbnailUrl || last.thumbnailUrl);
                    return (
                        <section className="sd-resume-section" onClick={() => handleCourseClick(last)}>
                            <div className="sd-resume-thumb" style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined} />
                            <div className="sd-resume-overlay">
                                <span className="sd-resume-label">Continue de onde parou</span>
                                <h3 className="sd-resume-title">{last.lastWatchedVideo?.title || last.name}</h3>
                                <div className="sd-resume-meta">
                                    <span className="sd-resume-course">{last.name}</span>
                                    <span className="sd-resume-sep">•</span>
                                    <span>{last.lastWatchedVideo?.moduleName || 'Módulo'}</span>
                                    <span className="sd-resume-sep">•</span>
                                    <span>Aula {lessonNum} de {last.totalVideos}</span>
                                </div>
                                <div className="sd-resume-progress-bar">
                                    <div className="sd-resume-progress-fill" style={{ width: `${last.progressPercent}%` }} />
                                </div>
                                <span className="sd-resume-percent">{last.progressPercent}% concluído</span>
                            </div>
                            <div className="sd-resume-play">
                                <PlayCircle size={36} />
                            </div>
                        </section>
                    );
                })()}

                {/* ─── SEÇÃO: AULAS AO VIVO ─── */}
                {liveClasses.length > 0 && (
                    <section className="sd-section sd-live-section">
                        <div className="sd-section-header">
                            <div className="sd-section-title">
                                <Radio size={22} color="#ef4444" />
                                <h2>Aulas ao Vivo</h2>
                            </div>
                        </div>
                        <div className="sd-live-cards">
                            {liveClasses.map((lc: any) => {
                                const isLive = lc.status === 'LIVE';
                                const dateStr = new Date(lc.startAt).toLocaleString('pt-BR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                });
                                return (
                                    <a
                                        key={lc.id}
                                        href={lc.zoomJoinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`sd-live-card ${isLive ? 'is-live' : ''}`}
                                    >
                                        <div className="sd-live-card-badge">
                                            {isLive ? (
                                                <><span className="sd-live-dot" /> AO VIVO</>
                                            ) : (
                                                <><Radio size={14} /> {dateStr}</>
                                            )}
                                        </div>
                                        <h3 className="sd-live-card-title">{lc.title}</h3>
                                        <span className="sd-live-card-course">{lc.course?.name}</span>
                                        {lc.module && <span className="sd-live-card-module">{lc.module.name}</span>}
                                        <span className="sd-live-card-join">
                                            <ExternalLink size={14} /> Entrar na aula
                                        </span>
                                    </a>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* ─── SEÇÃO 1: CONTINUAR ESTUDANDO ─── */}
                {continueCourses.length > 0 && (
                    <section className="sd-section">
                        <div className="sd-section-header">
                            <div className="sd-section-title">
                                <ShieldCheck size={22} color="var(--primary)" />
                                <h2>Continuar estudando</h2>
                            </div>
                            <CarouselNav id="continue" />
                        </div>
                        <Carousel carouselId="continue">
                            {continueCourses.map(course => {
                                const lessonNum = getLessonNumber(course);
                                const thumbUrl = getThumbUrl(course.lastWatchedVideo?.thumbnailUrl || course.thumbnailUrl);
                                return (
                                    <div
                                        key={course.id}
                                        className="sd-card-hero"
                                        onClick={() => handleCourseClick(course)}
                                    >
                                        <div
                                            className="sd-card-hero-bg"
                                            style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
                                        />
                                        <div className="sd-card-hero-overlay">
                                            <span className="sd-card-hero-badge">
                                                {course.lastWatchedVideo?.moduleName || 'Módulo'}
                                            </span>
                                            <h3 className="sd-card-hero-title">{course.name}</h3>
                                            <div className="sd-card-hero-meta">
                                                <span>Aula {lessonNum}</span>
                                                <span className="sd-meta-sep">|</span>
                                                <span>{course.progressPercent}%</span>
                                                <span className="sd-meta-sep">|</span>
                                                <span>{course.totalVideos} aulas</span>
                                            </div>
                                            <div className="sd-card-hero-progressbar">
                                                <div className="sd-card-hero-progressbar-fill" style={{ width: `${course.progressPercent}%` }} />
                                            </div>
                                            <div className="sd-card-hero-bottom">
                                                <span className="sd-card-hero-play">
                                                    <PlayCircle size={22} />
                                                    <span>{course.lastWatchedVideo?.title || 'Continuar'}</span>
                                                </span>
                                                <div className="sd-card-hero-actions">
                                                    <Flag size={16} />
                                                    <CheckSquare size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </Carousel>
                    </section>
                )}

                {/* ─── SEÇÃO 2: CURSOS EM ANDAMENTO ─── */}
                {(searchQuery ? filteredCourses : inProgressCourses.length > 0 ? inProgressCourses : courses).length > 0 && (
                    <section className="sd-section">
                        <div className="sd-section-header">
                            <div className="sd-section-title">
                                <BookOpen size={22} color="var(--primary)" />
                                <h2>Cursos em Andamento</h2>
                            </div>
                            <CarouselNav id="andamento" />
                        </div>
                        <Carousel carouselId="andamento">
                            {(searchQuery ? filteredCourses : inProgressCourses.length > 0 ? inProgressCourses : courses).map(course => {
                                const thumbUrl = getThumbUrl(course.thumbnailUrl);
                                return (
                                    <div
                                        key={course.id}
                                        className="sd-card-medium"
                                        onClick={() => handleCourseClick(course)}
                                    >
                                        <div
                                            className="sd-card-medium-bg"
                                            style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
                                        />
                                        <div className="sd-card-medium-overlay">
                                            <h5 className="sd-card-medium-name">{course.name}</h5>
                                            <span className="sd-card-medium-badge">{course.progressPercent}%</span>
                                        </div>
                                        <div className="sd-card-medium-bar">
                                            <div className="sd-card-medium-bar-fill" style={{ width: `${course.progressPercent}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </Carousel>
                    </section>
                )}

                {/* Estado vazio */}
                {courses.length === 0 && (
                    <div className="sd-empty-state">
                        <GraduationCap size={64} color="var(--text-muted)" />
                        <p>Nenhum curso encontrado. Aguarde a matrícula pelo administrador.</p>
                    </div>
                )}
            </main>
        </div>
    );
}

/* ═══════════════════════════════════════════
   Carousel Navigation Arrows
   ═══════════════════════════════════════════ */
function CarouselNav({ id }: { id: string }) {
    return (
        <div className="sd-carousel-nav">
            <button
                className="sd-carousel-arrow"
                onClick={() => {
                    const track = document.getElementById(`carousel-${id}`);
                    track?.scrollBy({ left: -400, behavior: 'smooth' });
                }}
                aria-label="Anterior"
            >
                <ChevronLeft size={18} />
            </button>
            <button
                className="sd-carousel-arrow"
                onClick={() => {
                    const track = document.getElementById(`carousel-${id}`);
                    track?.scrollBy({ left: 400, behavior: 'smooth' });
                }}
                aria-label="Próximo"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════
   Carousel Track (scroll horizontal)
   ═══════════════════════════════════════════ */
function Carousel({ children, carouselId }: { children: React.ReactNode; carouselId: string }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    return (
        <div className="sd-carousel-wrapper">
            <div
                className="sd-carousel-track"
                ref={scrollRef}
                id={`carousel-${carouselId}`}
            >
                {children}
            </div>
        </div>
    );
}
