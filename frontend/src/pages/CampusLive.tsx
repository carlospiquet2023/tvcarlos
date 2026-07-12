import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowRight, BookOpen, CalendarClock, ChevronLeft, Clock3,
    ExternalLink, Loader2, LogIn, Radio, RefreshCw, Signal, Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import BroadcastPlayer from '../components/BroadcastPlayer';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import {
    absoluteMediaUrl,
    defaultBroadcastSelection,
    fetchPublicBroadcast,
    safeExternalUrl,
    selectionFromProgram,
    type BroadcastProgram,
    type BroadcastPublicData,
} from '../lib/broadcast';
import './CampusLive.css';

function formatScheduleDate(value: string | null): string {
    if (!value) return 'Disponível agora';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Em breve';
    return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(date);
}

function programStatus(program: BroadcastProgram): string {
    if (!program.startAt) return 'CONTEÚDO';
    const now = Date.now();
    const starts = new Date(program.startAt).getTime();
    const ends = program.endAt ? new Date(program.endAt).getTime() : starts + 3_600_000;
    if (now >= starts && now <= ends) return 'AGORA';
    return starts > now ? 'EM BREVE' : 'REPLAY';
}

export default function CampusLive() {
    const { user } = useAuth();
    const { config } = useConfig();
    const [data, setData] = useState<BroadcastPublicData | null>(null);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let request: AbortController | undefined;

        const poll = async (initial = false) => {
            request?.abort();
            request = new AbortController();
            if (initial) setLoading(true);
            else setRefreshing(true);
            try {
                const result = await fetchPublicBroadcast(request.signal);
                if (!active) return;
                setData(result);
                setError('');
            } catch (loadError: unknown) {
                if (!active || request.signal.aborted) return;
                setError(loadError instanceof Error ? loadError.message : 'Não foi possível atualizar o Campus ao Vivo.');
            } finally {
                if (active) {
                    setLoading(false);
                    setRefreshing(false);
                    timer = setTimeout(() => void poll(false), 20_000);
                }
            }
        };

        void poll(true);
        return () => {
            active = false;
            clearTimeout(timer);
            request?.abort();
        };
    }, [refreshKey]);

    const selectedProgram = useMemo(
        () => data?.programs.find((program) => program.id === selectedProgramId) || null,
        [data?.programs, selectedProgramId],
    );
    const selection = useMemo(
        () => data ? (selectedProgram ? selectionFromProgram(selectedProgram) : defaultBroadcastSelection(data)) : null,
        [data, selectedProgram],
    );

    const tickerItems = data?.tickers.length
        ? data.tickers
        : [{ id: 'welcome', text: 'Bem-vindo ao Campus ao Vivo — aprendizado que continua dentro e fora da sala.', href: '', active: true, order: 0 }];

    if (loading && !data) {
        return (
            <div className="campus-loading" role="status">
                <Loader2 className="spinner" size={38} aria-hidden="true" />
                <span>Preparando o Campus ao Vivo…</span>
            </div>
        );
    }

    if (!data || !selection) {
        return (
            <main className="campus-unavailable">
                <Signal size={42} aria-hidden="true" />
                <h1>Campus ao Vivo temporariamente indisponível</h1>
                <p>{error || 'Não foi possível obter a programação neste momento.'}</p>
                <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
                    <RefreshCw size={17} aria-hidden="true" /> Tentar novamente
                </button>
                <Link to={user ? '/student/dashboard' : '/login'}>Voltar para a plataforma</Link>
            </main>
        );
    }

    const isLive = selection.mode === 'live';
    const logoUrl = config.logoUrl ? absoluteMediaUrl(config.logoUrl) : '';

    return (
        <div className="campus-page">
            <div className="campus-ambient campus-ambient-one" aria-hidden="true" />
            <div className="campus-ambient campus-ambient-two" aria-hidden="true" />

            <header className="campus-header">
                <Link to="/campus/ao-vivo" className="campus-brand" aria-label={`${config.platformName} — Campus ao Vivo`}>
                    {logoUrl ? <img src={logoUrl} alt="" /> : <span className="campus-brand-mark"><Signal size={22} /></span>}
                    <span>
                        <strong>{config.platformName}</strong>
                        <small>Campus ao Vivo</small>
                    </span>
                </Link>
                <nav className="campus-header-nav" aria-label="Navegação do Campus">
                    <Link to={user ? '/student/dashboard' : '/login'} className="campus-nav-secondary">
                        {user ? <ChevronLeft size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
                        {user ? 'Meus cursos' : 'Entrar'}
                    </Link>
                    {user && (
                        <Link to="/student/tutor" className="campus-nav-primary">
                            <Sparkles size={17} aria-hidden="true" /> Tutor IA
                        </Link>
                    )}
                </nav>
            </header>

            <main className="campus-main">
                {error && (
                    <div className="campus-inline-warning" role="status">
                        A última atualização falhou; mantendo a programação disponível.
                        <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Atualizar</button>
                    </div>
                )}

                <motion.section
                    className="campus-hero-copy"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                >
                    <div>
                        <span className={`campus-live-pill ${isLive ? 'is-live' : ''}`}>
                            <span aria-hidden="true" /> {isLive ? 'AO VIVO AGORA' : selection.mode === 'offline' ? 'SINAL EM PREPARAÇÃO' : 'PROGRAMAÇÃO 24H'}
                        </span>
                        <h1>{selection.title}</h1>
                        <p>{selection.description || data.settings.description}</p>
                    </div>
                    <div className="campus-signal-meta" aria-live="polite">
                        <Signal size={18} aria-hidden="true" />
                        <span>{refreshing ? 'Atualizando sinal…' : `Verificado às ${new Date(data.status.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
                    </div>
                </motion.section>

                <div className="campus-content-grid">
                    <motion.section
                        className="campus-stage"
                        aria-label="Transmissão do Campus"
                        initial={{ opacity: 0, scale: 0.99 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                    >
                        <BroadcastPlayer selection={selection} />
                        <div className="campus-now-playing">
                            <span className="campus-now-icon"><Radio size={18} aria-hidden="true" /></span>
                            <div>
                                <small>{selectedProgram ? 'VOCÊ ESTÁ ASSISTINDO' : isLive ? 'NO AR AGORA' : 'PROGRAMAÇÃO PRINCIPAL'}</small>
                                <strong>{selection.title}</strong>
                            </div>
                            {selectedProgram && (
                                <button type="button" onClick={() => setSelectedProgramId(null)}>
                                    Voltar ao sinal
                                </button>
                            )}
                        </div>
                    </motion.section>

                    <aside className="campus-agenda" aria-labelledby="campus-agenda-title">
                        <div className="campus-panel-heading">
                            <div>
                                <span>PROGRAMAÇÃO</span>
                                <h2 id="campus-agenda-title">Agenda do Campus</h2>
                            </div>
                            <CalendarClock size={22} aria-hidden="true" />
                        </div>
                        <div className="campus-agenda-list">
                            <button
                                type="button"
                                className={`campus-agenda-item ${selectedProgramId === null ? 'active' : ''}`}
                                onClick={() => setSelectedProgramId(null)}
                                aria-pressed={selectedProgramId === null}
                            >
                                <span className="campus-agenda-time"><Signal size={15} aria-hidden="true" /> SINAL</span>
                                <span className="campus-agenda-copy">
                                    <strong>{data.status.live ? data.settings.liveTitle : data.settings.loopTitle}</strong>
                                    <small>{data.status.live ? 'Transmissão ao vivo' : 'Programação contínua'}</small>
                                </span>
                                <ArrowRight size={16} aria-hidden="true" />
                            </button>

                            {data.programs.length ? data.programs.map((program) => (
                                <button
                                    type="button"
                                    key={program.id}
                                    className={`campus-agenda-item ${selectedProgramId === program.id ? 'active' : ''}`}
                                    onClick={() => program.sourceUrl && setSelectedProgramId(program.id)}
                                    aria-pressed={selectedProgramId === program.id}
                                    disabled={!program.sourceUrl}
                                >
                                    <span className="campus-agenda-time">
                                        <Clock3 size={14} aria-hidden="true" /> {programStatus(program)}
                                    </span>
                                    <span className="campus-agenda-copy">
                                        <strong>{program.title}</strong>
                                        <small>{formatScheduleDate(program.startAt)} · {program.category}</small>
                                    </span>
                                    {program.sourceUrl && <ArrowRight size={16} aria-hidden="true" />}
                                </button>
                            )) : (
                                <div className="campus-agenda-empty">
                                    <BookOpen size={25} aria-hidden="true" />
                                    <p>Novos encontros serão publicados aqui.</p>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>

                <section className="campus-ticker" aria-label="Notícias e avisos">
                    <span className="campus-ticker-label"><Sparkles size={15} aria-hidden="true" /> GIRO CAMPUS</span>
                    <div className="campus-ticker-window" tabIndex={0}>
                        <div className="campus-ticker-track">
                            {[...tickerItems, ...tickerItems].map((item, index) => {
                                const href = safeExternalUrl(item.href);
                                return href ? (
                                    <a key={`${item.id}-${index}`} href={href} target="_blank" rel="noopener noreferrer">
                                        {item.text} <ExternalLink size={12} aria-hidden="true" />
                                    </a>
                                ) : <span key={`${item.id}-${index}`}>{item.text}</span>;
                            })}
                        </div>
                    </div>
                </section>

                <section className="campus-partners" aria-labelledby="campus-partners-title">
                    <div className="campus-section-heading">
                        <div>
                            <span>ECOSSISTEMA</span>
                            <h2 id="campus-partners-title">Quem constrói este Campus</h2>
                        </div>
                        <p>Instituições e parceiros conectados à experiência de aprendizagem.</p>
                    </div>
                    {data.partners.length ? (
                        <div className="campus-partner-carousel-wrapper">
                            <div className="campus-partner-grid">
                                {[...data.partners, ...data.partners].map((partner, idx) => {
                                    const destination = safeExternalUrl(partner.destinationUrl);
                                    const content = (
                                        <>
                                            {partner.logoUrl
                                                ? <img src={absoluteMediaUrl(partner.logoUrl)} alt={`Logo de ${partner.name}`} loading="lazy" />
                                                : <span className="campus-partner-placeholder">{partner.name.charAt(0)}</span>}
                                            <strong>{partner.name}</strong>
                                            {destination && <ExternalLink size={14} aria-hidden="true" />}
                                        </>
                                    );

                                    return destination ? (
                                        <a key={`${partner.id}-${idx}`} href={destination} target="_blank" rel="noopener noreferrer">
                                            {content}
                                        </a>
                                    ) : (
                                        <div key={`${partner.id}-${idx}`}>
                                            {content}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="campus-partner-empty">O ecossistema de parceiros será apresentado em breve.</div>
                    )}
                </section>
            </main>

            <footer className="campus-footer">
                <span>{config.platformName} · Campus ao Vivo</span>
                <Link to={user ? '/student/dashboard' : '/login'}>{user ? 'Continuar aprendendo' : 'Acessar plataforma'} <ArrowRight size={14} /></Link>
            </footer>
        </div>
    );
}
