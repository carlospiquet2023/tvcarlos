import { useEffect, useMemo, useState } from 'react';
import {
    BookOpenCheck,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock3,
    GraduationCap,
    LogOut,
    MapPin,
    RefreshCw,
    ShieldCheck,
    TrendingUp,
    UserRound,
    UsersRound,
} from 'lucide-react';
import axios from 'axios';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './FamilyPortalPage.css';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'REMOTE';

interface Subject { id: string; code: string; name: string }
interface Timetable { id: string; dayOfWeek: number; startMinute: number; endMinute: number; room: string | null }
interface Offering { id: string; subject: Subject; teacher: { id: string; name: string } | null; timetable: Timetable[] }
interface Enrollment {
    id: string;
    organization: { id: string; name: string; timezone: string };
    schoolClass: {
        id: string;
        name: string;
        gradeLevel: string | null;
        shift: string;
        campus: { id: string; name: string };
        academicYear: { id: string; name: string; startDate: string; endDate: string };
        offerings: Offering[];
    };
}
interface Attendance {
    id: string;
    status: AttendanceStatus;
    minutesPresent: number | null;
    justification: string | null;
    session: { id: string; date: string; topic: string | null; offering: { subject: Subject } };
}
interface Grade {
    id: string;
    score: number | null;
    feedback: string | null;
    gradedAt: string | null;
    assessment: {
        id: string;
        title: string;
        type: string;
        dueAt: string | null;
        maxScore: number;
        weight: number;
        term: { id: string; name: string };
        offering: { subject: Subject };
    };
}
interface SchoolEvent { id: string; title: string; description: string | null; startsAt: string; endsAt: string | null; allDay: boolean; eventType: string }
interface Dependent {
    relationship: string;
    primaryContact: boolean;
    financialResponsible: boolean;
    pickupAuthorized: boolean;
    student: { id: string; name: string; email: string; registrationCode: string | null };
    enrollments: Enrollment[];
    attendance: Attendance[];
    grades: Grade[];
    events: SchoolEvent[];
}

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const statusLabel: Record<AttendanceStatus, string> = {
    PRESENT: 'Presença', ABSENT: 'Falta', LATE: 'Atraso', EXCUSED: 'Justificada', REMOTE: 'Remota'
};

function formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function minuteLabel(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function apiMessage(error: unknown): string {
    if (axios.isAxiosError(error)) return error.response?.data?.message || 'Não foi possível carregar os dados da família.';
    return 'Ocorreu um erro inesperado.';
}

export default function FamilyPortalPage() {
    const { user, logout } = useAuth();
    const [dependents, setDependents] = useState<Dependent[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get<{ data: { dependents: Dependent[] } }>('/api/v1/school/me/family');
            setDependents(response.data.data.dependents);
            setSelectedId((current) => current || response.data.data.dependents[0]?.student.id || '');
        } catch (requestError) {
            setError(apiMessage(requestError));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const selected = dependents.find((item) => item.student.id === selectedId) || dependents[0];
    const attendanceRate = useMemo(() => {
        if (!selected?.attendance.length) return null;
        const attended = selected.attendance.filter((item) => item.status !== 'ABSENT').length;
        return Math.round((attended / selected.attendance.length) * 100);
    }, [selected]);
    const gradeRate = useMemo(() => {
        const valid = selected?.grades.filter((item) => item.score !== null && item.assessment.maxScore > 0) || [];
        if (!valid.length) return null;
        return Math.round(valid.reduce((sum, item) => sum + ((item.score || 0) / item.assessment.maxScore) * 100, 0) / valid.length);
    }, [selected]);
    const timetable = selected?.enrollments.flatMap((enrollment) => enrollment.schoolClass.offerings.flatMap((offering) =>
        offering.timetable.map((slot) => ({ ...slot, subject: offering.subject, teacher: offering.teacher })))) || [];

    return (
        <div className="family-portal">
            <header className="family-header">
                <a className="family-brand" href="/family" aria-label="Portal da família">
                    <span><GraduationCap size={24} /></span>
                    <div><strong>Portal da Família</strong><small>Escola 360</small></div>
                </a>
                <div className="family-account">
                    <div><strong>{user?.name}</strong><small>Acesso seguro do responsável</small></div>
                    <button type="button" onClick={logout} title="Sair"><LogOut size={18} /></button>
                </div>
            </header>

            <main className="family-main">
                <section className="family-welcome">
                    <div>
                        <span className="family-eyebrow"><ShieldCheck size={15} /> Acompanhamento escolar protegido</span>
                        <h1>A vida escolar, clara e perto da família.</h1>
                        <p>Frequência, avaliações, agenda e horários reunidos em uma visão simples.</p>
                    </div>
                    <button type="button" className="family-refresh" onClick={() => void load()} disabled={loading}>
                        <RefreshCw size={17} className={loading ? 'family-spin' : ''} /> Atualizar
                    </button>
                </section>

                {error && <div className="family-alert">{error}</div>}
                {loading && !selected && <div className="family-loading"><RefreshCw className="family-spin" /> Carregando acompanhamento...</div>}
                {!loading && !selected && (
                    <div className="family-empty"><UsersRound size={38} /><h2>Nenhum estudante vinculado</h2><p>Peça à secretaria para confirmar seu vínculo de responsável.</p></div>
                )}

                {selected && <>
                    <nav className="family-dependents" aria-label="Estudantes vinculados">
                        {dependents.map((item) => (
                            <button key={item.student.id} type="button" className={item.student.id === selected.student.id ? 'active' : ''} onClick={() => setSelectedId(item.student.id)}>
                                <span className="family-avatar"><UserRound size={19} /></span>
                                <span><strong>{item.student.name}</strong><small>{item.relationship}</small></span>
                                <ChevronRight size={17} />
                            </button>
                        ))}
                    </nav>

                    <section className="family-student-card">
                        <div className="family-student-avatar">{selected.student.name.slice(0, 1).toUpperCase()}</div>
                        <div className="family-student-copy">
                            <span>Estudante</span><h2>{selected.student.name}</h2>
                            {selected.enrollments.map((enrollment) => <p key={enrollment.id}>
                                {enrollment.schoolClass.name} · {enrollment.schoolClass.academicYear.name}
                                <em><MapPin size={14} /> {enrollment.schoolClass.campus.name} — {enrollment.organization.name}</em>
                            </p>)}
                        </div>
                        <div className="family-trust"><CheckCircle2 size={18} /> Vínculo verificado</div>
                    </section>

                    <section className="family-kpis">
                        <article><span className="blue"><CheckCircle2 /></span><div><small>Frequência recente</small><strong>{attendanceRate === null ? '—' : `${attendanceRate}%`}</strong><p>{selected.attendance.length} registros consultados</p></div></article>
                        <article><span className="green"><TrendingUp /></span><div><small>Aproveitamento</small><strong>{gradeRate === null ? '—' : `${gradeRate}%`}</strong><p>{selected.grades.length} resultados publicados</p></div></article>
                        <article><span className="amber"><CalendarDays /></span><div><small>Próximos eventos</small><strong>{selected.events.length}</strong><p>na agenda institucional</p></div></article>
                        <article><span className="violet"><BookOpenCheck /></span><div><small>Componentes</small><strong>{selected.enrollments.reduce((sum, item) => sum + item.schoolClass.offerings.length, 0)}</strong><p>na matriz atual</p></div></article>
                    </section>

                    <div className="family-grid">
                        <section className="family-panel family-panel-wide">
                            <div className="family-panel-head"><div><small>Desempenho</small><h2>Avaliações publicadas</h2></div><TrendingUp /></div>
                            <div className="family-list">
                                {selected.grades.slice(0, 8).map((grade) => {
                                    const percent = grade.score === null ? null : Math.round((grade.score / grade.assessment.maxScore) * 100);
                                    return <article key={grade.id}>
                                        <span className="family-subject-icon">{grade.assessment.offering.subject.code.slice(0, 2)}</span>
                                        <div className="family-list-copy"><strong>{grade.assessment.title}</strong><small>{grade.assessment.offering.subject.name} · {grade.assessment.term.name}</small>{grade.feedback && <p>{grade.feedback}</p>}</div>
                                        <div className="family-score"><strong>{grade.score === null ? '—' : grade.score.toLocaleString('pt-BR')}</strong><small>de {grade.assessment.maxScore.toLocaleString('pt-BR')}</small>{percent !== null && <span>{percent}%</span>}</div>
                                    </article>;
                                })}
                                {!selected.grades.length && <p className="family-muted">Ainda não há avaliações publicadas.</p>}
                            </div>
                        </section>

                        <section className="family-panel">
                            <div className="family-panel-head"><div><small>Agenda</small><h2>Próximos eventos</h2></div><CalendarDays /></div>
                            <div className="family-events">
                                {selected.events.slice(0, 6).map((event) => <article key={event.id}><time><strong>{new Date(event.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(event.startsAt))}</span></time><div><strong>{event.title}</strong><small>{event.allDay ? 'Dia inteiro' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.startsAt))}</small></div></article>)}
                                {!selected.events.length && <p className="family-muted">Sem eventos futuros publicados.</p>}
                            </div>
                        </section>

                        <section className="family-panel family-panel-wide">
                            <div className="family-panel-head"><div><small>Diário</small><h2>Frequência recente</h2></div><CheckCircle2 /></div>
                            <div className="family-attendance">
                                {selected.attendance.slice(0, 10).map((record) => <article key={record.id}><div><strong>{record.session.offering.subject.name}</strong><small>{formatDate(record.session.date)}{record.session.topic ? ` · ${record.session.topic}` : ''}</small></div><span className={`status-${record.status.toLowerCase()}`}>{statusLabel[record.status]}</span></article>)}
                                {!selected.attendance.length && <p className="family-muted">A frequência aparecerá após o lançamento do diário.</p>}
                            </div>
                        </section>

                        <section className="family-panel">
                            <div className="family-panel-head"><div><small>Rotina</small><h2>Horários</h2></div><Clock3 /></div>
                            <div className="family-schedule">
                                {timetable.slice(0, 12).map((slot) => <article key={slot.id}><span>{weekdays[slot.dayOfWeek]}</span><div><strong>{slot.subject.name}</strong><small>{minuteLabel(slot.startMinute)}–{minuteLabel(slot.endMinute)}{slot.room ? ` · ${slot.room}` : ''}</small></div></article>)}
                                {!timetable.length && <p className="family-muted">Horários ainda não publicados.</p>}
                            </div>
                        </section>
                    </div>
                </>}
            </main>
        </div>
    );
}
