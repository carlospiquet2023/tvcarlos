import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft, BookOpenCheck, CalendarCheck, Check, ChevronRight, ClipboardCheck,
    GraduationCap, Loader2, Plus, RefreshCw, Save, School, UserPlus, UsersRound
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './ClassWorkspacePage.css';

type WorkspaceTab = 'roster' | 'journal' | 'assessments';
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'REMOTE';

interface Student { id: string; name: string; email: string; registrationCode: string | null }
interface Enrollment { id: string; student: Student }
interface Term { id: string; name: string; order: number }
interface Attendance { studentId: string; status: AttendanceStatus; justification: string | null }
interface Session { id: string; date: string; topic: string | null; content: string | null; homework: string | null; status: string; term: Term; attendance: Attendance[] }
interface Grade { studentId: string; score: number | null; feedback: string | null; status: string }
interface Assessment { id: string; title: string; type: string; dueAt: string | null; maxScore: number; published: boolean; term: Term; grades: Grade[] }
interface Offering { id: string; weeklyMinutes: number; subject: { id: string; code: string; name: string }; teacher: { id: string; name: string; email: string } | null; sessions: Session[]; assessments: Assessment[] }
interface Workspace {
    id: string; name: string; code: string; gradeLevel: string; educationStage: string | null; shift: string; room: string | null;
    campus: { id: string; name: string };
    academicYear: { id: string; name: string; terms: Term[] };
    enrollments: Enrollment[];
    offerings: Offering[];
}
interface Bootstrap {
    subjects: { id: string; code: string; name: string }[];
    memberships: { role: string; user: { id: string; name: string; email: string; role: string } }[];
}

const managementRoles = ['ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'SECRETARY'];
const attendanceLabels: Record<AttendanceStatus, string> = { PRESENT: 'Presente', ABSENT: 'Falta', LATE: 'Atraso', EXCUSED: 'Justificada', REMOTE: 'Remota' };

export default function ClassWorkspacePage() {
    const { organizationId = '', classId = '' } = useParams();
    const { user } = useAuth();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
    const [tab, setTab] = useState<WorkspaceTab>('roster');
    const [offeringId, setOfferingId] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [assessmentId, setAssessmentId] = useState('');
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
    const [grades, setGrades] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
    const [studentForm, setStudentForm] = useState({ name: '', email: '', registrationCode: '', temporaryPassword: '' });
    const [offeringForm, setOfferingForm] = useState({ subjectId: '', teacherId: '', weeklyMinutes: 200 });
    const [sessionForm, setSessionForm] = useState({ termId: '', date: new Date().toISOString().slice(0, 10), topic: '', content: '', homework: '' });
    const [assessmentForm, setAssessmentForm] = useState({ termId: '', title: '', type: 'TEST', dueAt: '', maxScore: 10, weight: 1, published: true });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [workspaceResponse, bootstrapResponse] = await Promise.all([
                api.get<{ data: Workspace }>(`/api/v1/school/organizations/${organizationId}/classes/${classId}/workspace`),
                api.get<{ data: Bootstrap }>(`/api/v1/school/organizations/${organizationId}/bootstrap`),
            ]);
            const next = workspaceResponse.data.data;
            setWorkspace(next);
            setBootstrap(bootstrapResponse.data.data);
            setOfferingId((current) => next.offerings.some((item) => item.id === current) ? current : next.offerings[0]?.id || '');
            const firstTerm = next.academicYear.terms[0]?.id || '';
            setSessionForm((current) => ({ ...current, termId: current.termId || firstTerm }));
            setAssessmentForm((current) => ({ ...current, termId: current.termId || firstTerm }));
        } catch (error) {
            setMessage({ kind: 'error', text: errorMessage(error) });
        } finally { setLoading(false); }
    }, [organizationId, classId]);

    useEffect(() => { void load(); }, [load]);

    const selectedOffering = workspace?.offerings.find((item) => item.id === offeringId) || null;
    const selectedSession = selectedOffering?.sessions.find((item) => item.id === sessionId) || null;
    const selectedAssessment = selectedOffering?.assessments.find((item) => item.id === assessmentId) || null;
    const actorMembership = bootstrap?.memberships.find((item) => item.user.id === user?.id);
    const canManage = user?.role === 'ADMIN' || managementRoles.includes(actorMembership?.role || '');
    const teachers = bootstrap?.memberships.filter((item) => ['TEACHER', 'COORDINATOR', 'PRINCIPAL'].includes(item.role)) || [];
    const unusedSubjects = bootstrap?.subjects.filter((subject) => !workspace?.offerings.some((item) => item.subject.id === subject.id)) || [];

    const attendanceSummary = useMemo(() => {
        const all = selectedOffering?.sessions.flatMap((session) => session.attendance) || [];
        if (!all.length) return 'Sem lançamentos';
        return `${Math.round(all.filter((item) => item.status !== 'ABSENT').length / all.length * 100)}% de presença`;
    }, [selectedOffering]);

    useEffect(() => {
        if (!selectedSession || !workspace) { setAttendance({}); return; }
        const existing = new Map(selectedSession.attendance.map((item) => [item.studentId, item.status]));
        setAttendance(Object.fromEntries(workspace.enrollments.map((item) => [item.student.id, existing.get(item.student.id) || 'PRESENT'])));
    }, [selectedSession, workspace]);

    useEffect(() => {
        if (!selectedAssessment || !workspace) { setGrades({}); return; }
        const existing = new Map(selectedAssessment.grades.map((item) => [item.studentId, item.score]));
        setGrades(Object.fromEntries(workspace.enrollments.map((item) => [item.student.id, existing.get(item.student.id)?.toString() || ''])));
    }, [selectedAssessment, workspace]);

    const execute = async (operation: () => Promise<unknown>, success: string) => {
        setSaving(true); setMessage(null);
        try { await operation(); setMessage({ kind: 'success', text: success }); await load(); }
        catch (error) { setMessage({ kind: 'error', text: errorMessage(error) }); }
        finally { setSaving(false); }
    };

    const createStudent = (event: FormEvent) => {
        event.preventDefault();
        void execute(() => api.post(`/api/v1/school/organizations/${organizationId}/people`, { ...studentForm, role: 'STUDENT', classId }), 'Estudante criado e matriculado com segurança.');
        setStudentForm({ name: '', email: '', registrationCode: '', temporaryPassword: '' });
    };
    const createOffering = (event: FormEvent) => {
        event.preventDefault();
        void execute(() => api.post(`/api/v1/school/organizations/${organizationId}/classes/${classId}/offerings`, { ...offeringForm, teacherId: offeringForm.teacherId || null }), 'Disciplina vinculada à turma.');
        setOfferingForm({ subjectId: '', teacherId: '', weeklyMinutes: 200 });
    };
    const createSession = (event: FormEvent) => {
        event.preventDefault();
        if (!offeringId) return;
        void execute(() => api.post(`/api/v1/school/offerings/${offeringId}/sessions`, sessionForm), 'Aula registrada no diário.');
        setSessionForm((current) => ({ ...current, topic: '', content: '', homework: '' }));
    };
    const saveAttendance = () => {
        if (!selectedSession) return;
        void execute(() => api.put(`/api/v1/school/sessions/${selectedSession.id}/attendance`, { records: Object.entries(attendance).map(([studentId, status]) => ({ studentId, status })) }), 'Chamada salva e diário concluído.');
    };
    const createAssessment = (event: FormEvent) => {
        event.preventDefault();
        if (!offeringId) return;
        const type = assessmentForm.type === 'TEST' ? 'EXAM' : assessmentForm.type === 'OBSERVATION' ? 'OTHER' : assessmentForm.type;
        void execute(() => api.post(`/api/v1/school/offerings/${offeringId}/assessments`, { ...assessmentForm, type, dueAt: assessmentForm.dueAt || null }), 'Avaliação criada.');
        setAssessmentForm((current) => ({ ...current, title: '', dueAt: '' }));
    };
    const saveGrades = () => {
        if (!selectedAssessment) return;
        void execute(() => api.put(`/api/v1/school/assessments/${selectedAssessment.id}/grades`, {
            grades: Object.entries(grades).map(([studentId, value]) => ({ studentId, score: value === '' ? null : Number(value), status: selectedAssessment.published ? 'PUBLISHED' : 'DRAFT' }))
        }), 'Notas salvas e publicadas conforme a avaliação.');
    };

    if (loading && !workspace) return <div className="class-loading"><Loader2 className="spinner" /> Abrindo espaço da turma...</div>;

    return <div className="class-workspace">
        <header className="class-topbar">
            <Link to="/school"><ArrowLeft size={18} /> Escola 360</Link>
            <div><span><School size={18} /></span><strong>{workspace?.name || 'Turma'}</strong><small>{workspace?.academicYear.name}</small></div>
            <button type="button" onClick={() => void load()}><RefreshCw size={16} /> Atualizar</button>
        </header>
        <main className="class-main">
            {message && <div className={`class-message ${message.kind}`}>{message.text}<button onClick={() => setMessage(null)}>×</button></div>}
            {workspace && <>
                <section className="class-hero">
                    <div className="class-hero-icon"><GraduationCap size={27} /></div>
                    <div><small>{workspace.code} · {workspace.gradeLevel}</small><h1>{workspace.name}</h1><p>{workspace.campus.name} · {workspace.academicYear.name} · {shiftLabel(workspace.shift)}{workspace.room ? ` · Sala ${workspace.room}` : ''}</p></div>
                    <div className="class-hero-stats"><span><strong>{workspace.enrollments.length}</strong><small>estudantes</small></span><span><strong>{workspace.offerings.length}</strong><small>disciplinas</small></span></div>
                </section>
                <nav className="class-tabs">
                    <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}><UsersRound size={17} /> Pessoas e disciplinas</button>
                    <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}><ClipboardCheck size={17} /> Diário e frequência</button>
                    <button className={tab === 'assessments' ? 'active' : ''} onClick={() => setTab('assessments')}><BookOpenCheck size={17} /> Avaliações e notas</button>
                </nav>

                {tab === 'roster' && <div className="class-grid">
                    <section className="class-panel"><PanelHeading icon={<UsersRound />} title="Estudantes matriculados" subtitle={`${workspace.enrollments.length} vínculo(s) ativo(s)`} /><div className="class-roster">{workspace.enrollments.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.student.name}</strong><small>{item.student.email}{item.student.registrationCode ? ` · ${item.student.registrationCode}` : ''}</small></div><Check size={16} /></article>)}{!workspace.enrollments.length && <Empty text="A turma ainda não possui estudantes." />}</div></section>
                    <aside className="class-stack">
                        {canManage && <section className="class-panel"><PanelHeading icon={<UserPlus />} title="Novo estudante" subtitle="Conta temporária e matrícula em uma etapa" /><form className="class-form" onSubmit={createStudent}><label>Nome<input required value={studentForm.name} onChange={(e) => setStudentForm((v) => ({ ...v, name: e.target.value }))} /></label><label>E-mail<input required type="email" value={studentForm.email} onChange={(e) => setStudentForm((v) => ({ ...v, email: e.target.value }))} /></label><label>Matrícula<input value={studentForm.registrationCode} onChange={(e) => setStudentForm((v) => ({ ...v, registrationCode: e.target.value }))} /></label><label>Senha temporária<input required type="password" minLength={10} value={studentForm.temporaryPassword} onChange={(e) => setStudentForm((v) => ({ ...v, temporaryPassword: e.target.value }))} placeholder="Maiúscula, número e símbolo" /></label><Submit saving={saving} label="Criar e matricular" /></form></section>}
                        {canManage && <section className="class-panel"><PanelHeading icon={<BookOpenCheck />} title="Adicionar disciplina" subtitle="Atribua o componente e o docente" /><form className="class-form" onSubmit={createOffering}><label>Disciplina<select required value={offeringForm.subjectId} onChange={(e) => setOfferingForm((v) => ({ ...v, subjectId: e.target.value }))}><option value="">Selecione</option>{unusedSubjects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label>Professor<select value={offeringForm.teacherId} onChange={(e) => setOfferingForm((v) => ({ ...v, teacherId: e.target.value }))}><option value="">A definir</option>{teachers.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.name}</option>)}</select></label><label>Minutos semanais<input type="number" min={0} value={offeringForm.weeklyMinutes} onChange={(e) => setOfferingForm((v) => ({ ...v, weeklyMinutes: Number(e.target.value) }))} /></label><Submit saving={saving} label="Vincular disciplina" /></form></section>}
                    </aside>
                    <section className="class-panel class-full"><PanelHeading icon={<BookOpenCheck />} title="Matriz da turma" subtitle="Componentes e responsabilidades" /><div className="class-offerings">{workspace.offerings.map((item) => <article key={item.id}><span>{item.subject.code}</span><div><strong>{item.subject.name}</strong><small>{item.teacher?.name || 'Professor a definir'} · {item.weeklyMinutes} min/semana</small></div><ChevronRight size={16} /></article>)}{!workspace.offerings.length && <Empty text="Vincule as disciplinas para iniciar o diário." />}</div></section>
                </div>}

                {tab === 'journal' && <div className="class-journal-layout">
                    <aside className="class-panel class-selector"><PanelHeading icon={<BookOpenCheck />} title="Disciplina" subtitle={attendanceSummary} />{workspace.offerings.map((item) => <button key={item.id} className={item.id === offeringId ? 'active' : ''} onClick={() => { setOfferingId(item.id); setSessionId(''); }}><span>{item.subject.code}</span><div><strong>{item.subject.name}</strong><small>{item.sessions.length} aula(s)</small></div><ChevronRight size={15} /></button>)}</aside>
                    <div className="class-stack">
                        {selectedOffering ? <>
                            <section className="class-panel"><PanelHeading icon={<CalendarCheck />} title="Registrar aula" subtitle={selectedOffering.subject.name} /><form className="class-form class-form-grid" onSubmit={createSession}><label>Período<select required value={sessionForm.termId} onChange={(e) => setSessionForm((v) => ({ ...v, termId: e.target.value }))}>{workspace.academicYear.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label>Data<input required type="date" value={sessionForm.date} onChange={(e) => setSessionForm((v) => ({ ...v, date: e.target.value }))} /></label><label className="wide">Tema da aula<input value={sessionForm.topic} onChange={(e) => setSessionForm((v) => ({ ...v, topic: e.target.value }))} /></label><label className="wide">Conteúdo trabalhado<textarea value={sessionForm.content} onChange={(e) => setSessionForm((v) => ({ ...v, content: e.target.value }))} /></label><label className="wide">Atividade para casa<textarea value={sessionForm.homework} onChange={(e) => setSessionForm((v) => ({ ...v, homework: e.target.value }))} /></label><Submit saving={saving} label="Registrar aula" /></form></section>
                            <section className="class-panel"><PanelHeading icon={<ClipboardCheck />} title="Chamada" subtitle="Selecione uma aula e revise cada estudante" /><div className="class-session-chips">{selectedOffering.sessions.map((session) => <button key={session.id} className={session.id === sessionId ? 'active' : ''} onClick={() => setSessionId(session.id)}>{formatDate(session.date)}<small>{session.topic || 'Sem tema'}</small></button>)}</div>{selectedSession ? <><div className="class-attendance-table">{workspace.enrollments.map((item) => <label key={item.id}><span>{item.student.name}</span><select value={attendance[item.student.id] || 'PRESENT'} onChange={(e) => setAttendance((v) => ({ ...v, [item.student.id]: e.target.value as AttendanceStatus }))}>{Object.entries(attendanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div><button className="class-primary" onClick={saveAttendance} disabled={saving}><Save size={16} /> Salvar chamada</button></> : <Empty text="Selecione uma aula para lançar a frequência." />}</section>
                        </> : <section className="class-panel"><Empty text="Adicione uma disciplina antes de registrar o diário." /></section>}
                    </div>
                </div>}

                {tab === 'assessments' && <div className="class-journal-layout">
                    <aside className="class-panel class-selector"><PanelHeading icon={<BookOpenCheck />} title="Disciplina" subtitle="Avaliação contínua" />{workspace.offerings.map((item) => <button key={item.id} className={item.id === offeringId ? 'active' : ''} onClick={() => { setOfferingId(item.id); setAssessmentId(''); }}><span>{item.subject.code}</span><div><strong>{item.subject.name}</strong><small>{item.assessments.length} avaliação(ões)</small></div><ChevronRight size={15} /></button>)}</aside>
                    <div className="class-stack">{selectedOffering ? <>
                        <section className="class-panel"><PanelHeading icon={<Plus />} title="Nova avaliação" subtitle="Defina critérios antes do lançamento" /><form className="class-form class-form-grid" onSubmit={createAssessment}><label>Período<select required value={assessmentForm.termId} onChange={(e) => setAssessmentForm((v) => ({ ...v, termId: e.target.value }))}>{workspace.academicYear.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label>Tipo<select value={assessmentForm.type} onChange={(e) => setAssessmentForm((v) => ({ ...v, type: e.target.value }))}><option value="TEST">Prova</option><option value="ASSIGNMENT">Atividade</option><option value="PROJECT">Projeto</option><option value="PRESENTATION">Apresentação</option><option value="OBSERVATION">Observação</option></select></label><label className="wide">Título<input required value={assessmentForm.title} onChange={(e) => setAssessmentForm((v) => ({ ...v, title: e.target.value }))} /></label><label>Data<input type="datetime-local" value={assessmentForm.dueAt} onChange={(e) => setAssessmentForm((v) => ({ ...v, dueAt: e.target.value }))} /></label><label>Nota máxima<input type="number" min="0.01" step="0.01" value={assessmentForm.maxScore} onChange={(e) => setAssessmentForm((v) => ({ ...v, maxScore: Number(e.target.value) }))} /></label><label className="class-check"><input type="checkbox" checked={assessmentForm.published} onChange={(e) => setAssessmentForm((v) => ({ ...v, published: e.target.checked }))} /> Visível no portal da família</label><Submit saving={saving} label="Criar avaliação" /></form></section>
                        <section className="class-panel"><PanelHeading icon={<GraduationCap />} title="Lançamento de notas" subtitle="Rascunhos não aparecem à família" /><div className="class-assessment-chips">{selectedOffering.assessments.map((item) => <button key={item.id} className={item.id === assessmentId ? 'active' : ''} onClick={() => setAssessmentId(item.id)}><strong>{item.title}</strong><small>{item.term.name} · {item.published ? 'Publicada' : 'Rascunho'}</small></button>)}</div>{selectedAssessment ? <><div className="class-grade-table">{workspace.enrollments.map((item) => <label key={item.id}><span>{item.student.name}</span><div><input type="number" min={0} max={selectedAssessment.maxScore} step="0.01" value={grades[item.student.id] || ''} onChange={(e) => setGrades((v) => ({ ...v, [item.student.id]: e.target.value }))} /><small>/ {selectedAssessment.maxScore}</small></div></label>)}</div><button className="class-primary" onClick={saveGrades} disabled={saving}><Save size={16} /> Salvar notas</button></> : <Empty text="Selecione uma avaliação para lançar notas." />}</section>
                    </> : <section className="class-panel"><Empty text="Adicione uma disciplina antes de avaliar." /></section>}</div>
                </div>}
            </>}
        </main>
    </div>;
}

function PanelHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <header className="class-panel-heading"><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div></header>; }
function Empty({ text }: { text: string }) { return <div className="class-empty"><GraduationCap size={25} /><p>{text}</p></div>; }
function Submit({ saving, label }: { saving: boolean; label: string }) { return <button className="class-primary" disabled={saving}>{saving ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />}{label}</button>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }); }
function shiftLabel(value: string) { return ({ MORNING: 'Manhã', AFTERNOON: 'Tarde', EVENING: 'Noite', FULL_TIME: 'Integral', FLEXIBLE: 'Flexível' } as Record<string, string>)[value] || value; }
function errorMessage(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || 'Não foi possível concluir a operação.' : 'Ocorreu um erro inesperado.'; }
