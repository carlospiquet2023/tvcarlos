import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    BarChart3, BookOpenCheck, Building2, CalendarRange, CheckCircle2, ChevronRight,
    ClipboardCheck, GraduationCap, LayoutDashboard, Loader2, Plus, RefreshCw,
    LogOut, School, Settings2, Sparkles, Users, WandSparkles
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './SchoolManagementPage.css';

type SchoolTab = 'overview' | 'structure' | 'curriculum' | 'classes';

interface OrganizationSummary {
    id: string;
    slug: string;
    name: string;
    status: string;
    timezone: string;
    _count: { campuses: number; classes: number; memberships: number };
}

interface Campus { id: string; code: string; name: string; active: boolean; inepCode?: string | null; }
interface AcademicTerm { id: string; name: string; order: number; startDate: string; endDate: string; status: string; }
interface AcademicYear { id: string; name: string; startDate: string; endDate: string; status: string; terms: AcademicTerm[]; }
interface Subject { id: string; code: string; name: string; knowledgeArea?: string | null; workloadMinutes: number; }
interface SchoolClass {
    id: string; code: string; name: string; gradeLevel: string; shift: string; room?: string | null;
    campus: { id: string; name: string };
    academicYear: { id: string; name: string; status: string };
    _count: { enrollments: number; offerings: number };
}
interface Membership { id: string; role: string; user: { id: string; name: string; email: string; role: string }; campus?: { id: string; name: string } | null; }
interface OrganizationBootstrap extends OrganizationSummary {
    legalName?: string | null;
    inepCode?: string | null;
    campuses: Campus[];
    academicYears: AcademicYear[];
    subjects: Subject[];
    classes: SchoolClass[];
    memberships: Membership[];
}
interface Overview { campuses: number; classes: number; activeEnrollments: number; offerings: number; openInterventions: number; sessionsToday: number; }

const initialSetup = {
    name: '', slug: '', legalName: '', inepCode: '', timezone: 'America/Sao_Paulo',
    campusName: 'Unidade Principal', campusCode: 'SEDE', campusInepCode: '',
    yearName: String(new Date().getFullYear()), startDate: `${new Date().getFullYear()}-02-01`, endDate: `${new Date().getFullYear()}-12-20`,
};

export default function SchoolManagementPage() {
    const { user, logout } = useAuth();
    const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [bootstrap, setBootstrap] = useState<OrganizationBootstrap | null>(null);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [tab, setTab] = useState<SchoolTab>('overview');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [setup, setSetup] = useState(initialSetup);
    const [showSetup, setShowSetup] = useState(false);
    const [campusForm, setCampusForm] = useState({ code: '', name: '', inepCode: '', email: '', phone: '' });
    const [subjectForm, setSubjectForm] = useState({ code: '', name: '', knowledgeArea: '', bnccArea: '', workloadMinutes: 0 });
    const [classForm, setClassForm] = useState({ campusId: '', academicYearId: '', code: '', name: '', gradeLevel: '', educationStage: '', shift: 'MORNING', capacity: 35, room: '' });

    const loadOrganizations = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get<{ data: OrganizationSummary[] }>('/api/v1/school/organizations');
            setOrganizations(response.data.data);
            setSelectedId((current) => current || response.data.data[0]?.id || '');
            if (!response.data.data.length && user?.role === 'ADMIN') setShowSetup(true);
        } catch (requestError: unknown) {
            setError(messageFrom(requestError, 'Não foi possível carregar as instituições.'));
        } finally {
            setLoading(false);
        }
    }, [user]);

    const loadOrganization = useCallback(async (organizationId: string) => {
        if (!organizationId) { setBootstrap(null); setOverview(null); return; }
        setLoading(true);
        setError('');
        try {
            const [bootstrapResponse, overviewResponse] = await Promise.all([
                api.get<{ data: OrganizationBootstrap }>(`/api/v1/school/organizations/${organizationId}/bootstrap`),
                api.get<{ data: Overview }>(`/api/v1/school/organizations/${organizationId}/overview`),
            ]);
            setBootstrap(bootstrapResponse.data.data);
            setOverview(overviewResponse.data.data);
            const firstCampus = bootstrapResponse.data.data.campuses[0]?.id || '';
            const activeYear = bootstrapResponse.data.data.academicYears.find((year) => year.status === 'ACTIVE')?.id || bootstrapResponse.data.data.academicYears[0]?.id || '';
            setClassForm((current) => ({ ...current, campusId: current.campusId || firstCampus, academicYearId: current.academicYearId || activeYear }));
        } catch (requestError: unknown) {
            setError(messageFrom(requestError, 'Não foi possível carregar a operação escolar.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadOrganizations(); }, [loadOrganizations]);
    useEffect(() => { void loadOrganization(selectedId); }, [loadOrganization, selectedId]);

    const setupProgress = useMemo(() => {
        if (!bootstrap) return 0;
        return [bootstrap.campuses.length, bootstrap.academicYears.length, bootstrap.subjects.length, bootstrap.classes.length, bootstrap.memberships.length]
            .filter((value) => value > 0).length * 20;
    }, [bootstrap]);

    const submitSetup = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true); setError(''); setSuccess('');
        try {
            const response = await api.post<{ data: OrganizationSummary }>('/api/v1/school/organizations/setup', {
                name: setup.name, slug: setup.slug, legalName: setup.legalName, inepCode: setup.inepCode, timezone: setup.timezone,
                campus: { name: setup.campusName, code: setup.campusCode, inepCode: setup.campusInepCode },
                academicYear: { name: setup.yearName, startDate: setup.startDate, endDate: setup.endDate, terms: fourTerms(setup.startDate, setup.endDate) },
            });
            setShowSetup(false);
            setSuccess('Instituição configurada. Agora cadastre currículo e turmas.');
            await loadOrganizations();
            setSelectedId(response.data.data.id);
        } catch (requestError: unknown) {
            setError(messageFrom(requestError, 'Não foi possível concluir a configuração.'));
        } finally { setSaving(false); }
    };

    const submitCampus = async (event: FormEvent) => {
        event.preventDefault();
        await saveAndReload(`/api/v1/school/organizations/${selectedId}/campuses`, { ...campusForm }, 'Unidade adicionada.');
        setCampusForm({ code: '', name: '', inepCode: '', email: '', phone: '' });
    };

    const submitSubject = async (event: FormEvent) => {
        event.preventDefault();
        await saveAndReload(`/api/v1/school/organizations/${selectedId}/subjects`, { ...subjectForm }, 'Disciplina adicionada.');
        setSubjectForm({ code: '', name: '', knowledgeArea: '', bnccArea: '', workloadMinutes: 0 });
    };

    const submitClass = async (event: FormEvent) => {
        event.preventDefault();
        await saveAndReload(`/api/v1/school/organizations/${selectedId}/classes`, { ...classForm }, 'Turma criada.');
        setClassForm((current) => ({ ...current, code: '', name: '', gradeLevel: '', educationStage: '', room: '' }));
    };

    const saveAndReload = async (url: string, payload: object, successMessage: string) => {
        setSaving(true); setError(''); setSuccess('');
        try {
            await api.post(url, payload);
            setSuccess(successMessage);
            await loadOrganization(selectedId);
        } catch (requestError: unknown) {
            setError(messageFrom(requestError, 'Não foi possível salvar.'));
        } finally { setSaving(false); }
    };

    if (loading && !organizations.length && !showSetup) return <div className="school-loading"><Loader2 className="spinner" /> Preparando operação escolar...</div>;

    return (
        <div className="school-os">
            <header className="school-topbar">
                <Link to="/school" className="school-brand"><span><School size={22} /></span><div><strong>Escola 360</strong><small>Sistema operacional educacional</small></div></Link>
                <div className="school-topbar-actions">
                    {organizations.length > 0 && <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Instituição ativa">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>}
                    {user?.role === 'ADMIN' && <button onClick={() => setShowSetup(true)}><Plus size={16} /> Nova instituição</button>}
                    {(user?.role === 'ADMIN' || user?.role === 'TEACHER') && <Link to="/admin">Voltar ao painel</Link>}
                    <button onClick={logout} title="Sair"><LogOut size={16} /> Sair</button>
                </div>
            </header>

            <div className="school-shell">
                <aside className="school-sidebar" aria-label="Módulos escolares">
                    <div className="school-context"><Building2 size={18} /><div><strong>{bootstrap?.name || 'Configuração'}</strong><small>{bootstrap?.inepCode ? `INEP ${bootstrap.inepCode}` : 'Operação institucional'}</small></div></div>
                    <nav>
                        <SchoolNav icon={<LayoutDashboard size={17} />} label="Visão geral" active={tab === 'overview'} onClick={() => setTab('overview')} />
                        <SchoolNav icon={<Building2 size={17} />} label="Estrutura" active={tab === 'structure'} onClick={() => setTab('structure')} />
                        <SchoolNav icon={<BookOpenCheck size={17} />} label="Currículo" active={tab === 'curriculum'} onClick={() => setTab('curriculum')} />
                        <SchoolNav icon={<Users size={17} />} label="Turmas" active={tab === 'classes'} onClick={() => setTab('classes')} />
                    </nav>
                    <div className="school-sidebar-foot"><Settings2 size={16} /><span>Configuração concluída</span><strong>{setupProgress}%</strong><div><i style={{ width: `${setupProgress}%` }} /></div></div>
                </aside>

                <main className="school-main">
                    {(error || success) && <div className={`school-alert ${error ? 'error' : 'success'}`}>{error || success}<button onClick={() => { setError(''); setSuccess(''); }}>×</button></div>}

                    {showSetup && user?.role === 'ADMIN' ? <SetupWizard setup={setup} setSetup={setSetup} onSubmit={submitSetup} saving={saving} onCancel={organizations.length ? () => setShowSetup(false) : undefined} /> : (
                        <>
                            {tab === 'overview' && <OverviewPanel overview={overview} bootstrap={bootstrap} progress={setupProgress} onNavigate={setTab} onRefresh={() => void loadOrganization(selectedId)} />}
                            {tab === 'structure' && <StructurePanel bootstrap={bootstrap} form={campusForm} setForm={setCampusForm} onSubmit={submitCampus} saving={saving} />}
                            {tab === 'curriculum' && <CurriculumPanel bootstrap={bootstrap} form={subjectForm} setForm={setSubjectForm} onSubmit={submitSubject} saving={saving} />}
                            {tab === 'classes' && <ClassesPanel bootstrap={bootstrap} form={classForm} setForm={setClassForm} onSubmit={submitClass} saving={saving} />}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}

function SchoolNav({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span><ChevronRight size={14} /></button>;
}

function SetupWizard({ setup, setSetup, onSubmit, saving, onCancel }: { setup: typeof initialSetup; setSetup: React.Dispatch<React.SetStateAction<typeof initialSetup>>; onSubmit: (event: FormEvent) => void; saving: boolean; onCancel?: () => void }) {
    const field = (name: keyof typeof initialSetup) => ({ value: setup[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSetup((current) => ({ ...current, [name]: event.target.value })) });
    return <section className="school-wizard">
        <div className="school-wizard-intro"><span><WandSparkles size={28} /></span><div><small>CONFIGURAÇÃO GUIADA</small><h1>Sua escola pronta em poucos minutos</h1><p>Crie a estrutura mínima. Depois você poderá importar pessoas, currículo e turmas sem refazer dados.</p></div></div>
        <form onSubmit={onSubmit}>
            <fieldset><legend><span>1</span> Instituição</legend><div className="school-form-grid"><label>Nome da instituição<input {...field('name')} required /></label><label>Identificador na URL<input {...field('slug')} pattern="[a-z0-9-]+" required /></label><label>Razão social<input {...field('legalName')} /></label><label>Código INEP<input {...field('inepCode')} /></label></div></fieldset>
            <fieldset><legend><span>2</span> Unidade principal</legend><div className="school-form-grid"><label>Nome da unidade<input {...field('campusName')} required /></label><label>Código<input {...field('campusCode')} required /></label><label>Código INEP da unidade<input {...field('campusInepCode')} /></label></div></fieldset>
            <fieldset><legend><span>3</span> Ano e quatro períodos</legend><div className="school-form-grid"><label>Nome do ano<input {...field('yearName')} required /></label><label>Início<input type="date" {...field('startDate')} required /></label><label>Fim<input type="date" {...field('endDate')} required /></label></div><p className="school-form-hint">Quatro bimestres serão distribuídos automaticamente e poderão ser ajustados pela secretaria.</p></fieldset>
            <div className="school-form-actions">{onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}<button className="primary" disabled={saving}>{saving ? <Loader2 className="spinner" size={17} /> : <Sparkles size={17} />} Criar operação escolar</button></div>
        </form>
    </section>;
}

function OverviewPanel({ overview, bootstrap, progress, onNavigate, onRefresh }: { overview: Overview | null; bootstrap: OrganizationBootstrap | null; progress: number; onNavigate: (tab: SchoolTab) => void; onRefresh: () => void }) {
    const stats = [
        ['Alunos ativos', overview?.activeEnrollments || 0, Users], ['Turmas', overview?.classes || 0, GraduationCap],
        ['Aulas hoje', overview?.sessionsToday || 0, ClipboardCheck], ['Intervenções', overview?.openInterventions || 0, BarChart3],
    ] as const;
    return <>
        <div className="school-page-heading"><div><small>VISÃO EXECUTIVA</small><h1>{bootstrap?.name || 'Operação escolar'}</h1><p>O que precisa de atenção hoje, sem ruído.</p></div><button onClick={onRefresh}><RefreshCw size={16} /> Atualizar</button></div>
        <div className="school-stat-grid">{stats.map(([label, value, Icon]) => <article key={label}><span><Icon size={20} /></span><div><strong>{value}</strong><small>{label}</small></div></article>)}</div>
        <div className="school-overview-grid">
            <section className="school-panel"><header><div><CheckCircle2 size={19} /><span><strong>Prontidão da instituição</strong><small>Fundação necessária para operar</small></span></div><b>{progress}%</b></header><div className="school-readiness"><div><i style={{ width: `${progress}%` }} /></div>{[['Unidades', bootstrap?.campuses.length], ['Ano letivo', bootstrap?.academicYears.length], ['Currículo', bootstrap?.subjects.length], ['Turmas', bootstrap?.classes.length], ['Equipe', bootstrap?.memberships.length]].map(([label, value]) => <button key={String(label)} onClick={() => onNavigate(label === 'Currículo' ? 'curriculum' : label === 'Turmas' ? 'classes' : 'structure')}><span>{Number(value) > 0 ? <CheckCircle2 size={16} /> : <Plus size={16} />}{label}</span><strong>{value || 0}</strong></button>)}</div></section>
            <section className="school-panel school-next-actions"><header><div><Sparkles size={19} /><span><strong>Próximas ações</strong><small>Ordem recomendada</small></span></div></header>{bootstrap?.subjects.length === 0 && <button onClick={() => onNavigate('curriculum')}><span>Cadastre as disciplinas</span><ChevronRight size={17} /></button>}{bootstrap?.classes.length === 0 && <button onClick={() => onNavigate('classes')}><span>Crie a primeira turma</span><ChevronRight size={17} /></button>}<button onClick={() => onNavigate('structure')}><span>Revise períodos e unidades</span><ChevronRight size={17} /></button></section>
        </div>
    </>;
}

function StructurePanel({ bootstrap, form, setForm, onSubmit, saving }: { bootstrap: OrganizationBootstrap | null; form: { code: string; name: string; inepCode: string; email: string; phone: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent) => void; saving: boolean }) {
    return <><PageHeading kicker="ESTRUTURA" title="Unidades e calendário" description="A base organizacional usada por turmas, pessoas e relatórios oficiais." />
        <div className="school-two-cols"><section className="school-panel"><PanelTitle icon={<Building2 size={18} />} title="Unidades" subtitle={`${bootstrap?.campuses.length || 0} cadastrada(s)`} /><div className="school-list">{bootstrap?.campuses.map((campus) => <article key={campus.id}><span><Building2 size={17} /></span><div><strong>{campus.name}</strong><small>{campus.code}{campus.inepCode ? ` · INEP ${campus.inepCode}` : ''}</small></div><b>{campus.active ? 'ATIVA' : 'INATIVA'}</b></article>)}</div></section>
            <section className="school-panel"><PanelTitle icon={<Plus size={18} />} title="Nova unidade" subtitle="Adicione escolas ou campi" /><SimpleForm onSubmit={onSubmit} saving={saving}><label>Nome<input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required /></label><label>Código<input value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} required /></label><label>Código INEP<input value={form.inepCode} onChange={(e) => setForm((v) => ({ ...v, inepCode: e.target.value }))} /></label><label>E-mail<input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></label></SimpleForm></section></div>
        <section className="school-panel school-year-panel"><PanelTitle icon={<CalendarRange size={18} />} title="Anos e períodos letivos" subtitle="Fechamento protege os registros acadêmicos" /><div className="school-year-list">{bootstrap?.academicYears.map((year) => <article key={year.id}><div><strong>{year.name}</strong><small>{formatDate(year.startDate)} — {formatDate(year.endDate)}</small></div><span>{year.status}</span><div className="school-term-row">{year.terms.map((term) => <i key={term.id}>{term.name}</i>)}</div></article>)}</div></section>
    </>;
}

function CurriculumPanel({ bootstrap, form, setForm, onSubmit, saving }: { bootstrap: OrganizationBootstrap | null; form: { code: string; name: string; knowledgeArea: string; bnccArea: string; workloadMinutes: number }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent) => void; saving: boolean }) {
    return <><PageHeading kicker="CURRÍCULO" title="Disciplinas e BNCC" description="Um catálogo único para horários, diário, avaliações e competências." /><div className="school-two-cols curriculum"><section className="school-panel"><PanelTitle icon={<BookOpenCheck size={18} />} title="Catálogo curricular" subtitle={`${bootstrap?.subjects.length || 0} disciplina(s)`} /><div className="school-subject-grid">{bootstrap?.subjects.map((subject) => <article key={subject.id}><span>{subject.code}</span><strong>{subject.name}</strong><small>{subject.knowledgeArea || 'Área não informada'}</small><b>{Math.round(subject.workloadMinutes / 60)}h</b></article>)}</div></section><section className="school-panel"><PanelTitle icon={<Plus size={18} />} title="Nova disciplina" subtitle="Alinhe com a matriz da rede" /><SimpleForm onSubmit={onSubmit} saving={saving}><label>Código<input value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} required /></label><label>Nome<input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required /></label><label>Área de conhecimento<input value={form.knowledgeArea} onChange={(e) => setForm((v) => ({ ...v, knowledgeArea: e.target.value }))} /></label><label>Carga horária em minutos<input type="number" min={0} value={form.workloadMinutes} onChange={(e) => setForm((v) => ({ ...v, workloadMinutes: Number(e.target.value) }))} /></label></SimpleForm></section></div></>;
}

function ClassesPanel({ bootstrap, form, setForm, onSubmit, saving }: { bootstrap: OrganizationBootstrap | null; form: { campusId: string; academicYearId: string; code: string; name: string; gradeLevel: string; educationStage: string; shift: string; capacity: number; room: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent) => void; saving: boolean }) {
    return <><PageHeading kicker="TURMAS" title="Organização acadêmica" description="Matrículas, docentes, horários e diário convergem aqui." /><div className="school-two-cols classes"><section className="school-panel"><PanelTitle icon={<Users size={18} />} title="Turmas" subtitle={`${bootstrap?.classes.length || 0} cadastrada(s)`} /><div className="school-class-list">{bootstrap?.classes.map((item) => <Link to={`/school/organizations/${bootstrap.id}/classes/${item.id}`} className="school-class-link" key={item.id}><article><span><GraduationCap size={19} /></span><div><strong>{item.name}</strong><small>{item.campus.name} · {item.academicYear.name} · {item.gradeLevel}</small></div><div><b>{item._count.enrollments}</b><small>alunos</small></div><div><b>{item._count.offerings}</b><small>disciplinas</small></div></article></Link>)}</div></section><section className="school-panel"><PanelTitle icon={<Plus size={18} />} title="Nova turma" subtitle="Use nomes familiares à secretaria" /><SimpleForm onSubmit={onSubmit} saving={saving}><label>Unidade<select value={form.campusId} onChange={(e) => setForm((v) => ({ ...v, campusId: e.target.value }))} required><option value="">Selecione</option>{bootstrap?.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Ano letivo<select value={form.academicYearId} onChange={(e) => setForm((v) => ({ ...v, academicYearId: e.target.value }))} required><option value="">Selecione</option>{bootstrap?.academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label><label>Código<input value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} required /></label><label>Nome<input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required /></label><label>Ano/série<input value={form.gradeLevel} onChange={(e) => setForm((v) => ({ ...v, gradeLevel: e.target.value }))} required /></label><label>Etapa<input value={form.educationStage} onChange={(e) => setForm((v) => ({ ...v, educationStage: e.target.value }))} placeholder="Ensino Fundamental" /></label><label>Turno<select value={form.shift} onChange={(e) => setForm((v) => ({ ...v, shift: e.target.value }))}><option value="MORNING">Manhã</option><option value="AFTERNOON">Tarde</option><option value="EVENING">Noite</option><option value="FULL_TIME">Integral</option><option value="FLEXIBLE">Flexível</option></select></label><label>Capacidade<input type="number" min={1} value={form.capacity} onChange={(e) => setForm((v) => ({ ...v, capacity: Number(e.target.value) }))} /></label></SimpleForm></section></div></>;
}

function PageHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) { return <div className="school-page-heading"><div><small>{kicker}</small><h1>{title}</h1><p>{description}</p></div></div>; }
function PanelTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <header className="school-panel-title"><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div></header>; }
function SimpleForm({ children, onSubmit, saving }: { children: React.ReactNode; onSubmit: (event: FormEvent) => void; saving: boolean }) { return <form className="school-simple-form" onSubmit={onSubmit}>{children}<button className="primary" disabled={saving}>{saving ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />} Salvar</button></form>; }

function fourTerms(startValue: string, endValue: string) {
    const start = new Date(`${startValue}T00:00:00Z`); const end = new Date(`${endValue}T00:00:00Z`);
    const totalDays = Math.max(4, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return Array.from({ length: 4 }, (_, index) => {
        const termStart = new Date(start.getTime() + Math.floor(totalDays * index / 4) * 86_400_000);
        const termEnd = index === 3 ? end : new Date(start.getTime() + (Math.floor(totalDays * (index + 1) / 4) - 1) * 86_400_000);
        return { name: `${index + 1}º Bimestre`, startDate: isoDate(termStart), endDate: isoDate(termEnd) };
    });
}
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function formatDate(value: string) { return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }
function messageFrom(error: unknown, fallback: string) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback; }
