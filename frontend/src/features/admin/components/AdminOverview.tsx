import type { CSSProperties } from 'react';
import { Activity, AlertCircle, AlertTriangle, BookOpen, CalendarDays, ChevronDown, Clock3, Database, FileVideo, Layers3, Library, MessageCircle, Server, Upload, UserCheck, UserCog, Users, Video } from 'lucide-react';
import type { AdminTab, AuditLogData, CourseReport, HealthData, StatsData } from '../types';
import { auditActionLabel } from '../utils';

interface AdminOverviewProps {
    adminDate: string;
    auditLogs: AuditLogData[];
    courseRows: CourseReport[];
    flaggedTotal: number;
    healthData: HealthData | null;
    platformName: string;
    stats: StatsData;
    teacherTotal: number;
    userName?: string;
    userTotal: number;
    onSelectTab: (tab: AdminTab) => void;
}

export function AdminOverview({ adminDate, auditLogs, courseRows, flaggedTotal, healthData, platformName, stats, teacherTotal, userName, userTotal, onSelectTab }: AdminOverviewProps) {
    const maxCourseStudents = Math.max(1, ...courseRows.map(course => course.totalStudents));

    return (
        <div className="admin-fade-in admin-overview">
            <section className="admin-overview-welcome">
                <div><span>Painel executivo</span><h1>Olá, {userName?.split(' ')[0] || 'Administrador'}! <span aria-hidden="true">👋</span></h1><p>Aqui está o resumo operacional da plataforma {platformName}.</p></div>
                <time><CalendarDays size={17} /> {adminDate}</time>
            </section>

            <section className="admin-overview-kpis" aria-label="Indicadores da plataforma">
                <article><span className="violet"><Users /></span><div><small>Total de alunos</small><strong>{stats.totalUsers.toLocaleString('pt-BR')}</strong><p>contas estudantis</p></div></article>
                <article><span className="blue"><BookOpen /></span><div><small>Cursos ativos</small><strong>{stats.totalCourses.toLocaleString('pt-BR')}</strong><p>catálogo publicado</p></div></article>
                <article><span className="green"><FileVideo /></span><div><small>Aulas publicadas</small><strong>{stats.readyVideos.toLocaleString('pt-BR')}</strong><p>de {stats.totalVideos} vídeos</p></div></article>
                <article><span className="amber"><UserCheck /></span><div><small>Matrículas</small><strong>{stats.totalEnrollments.toLocaleString('pt-BR')}</strong><p>vínculos ativos</p></div></article>
                <article><span className="violet"><Layers3 /></span><div><small>Módulos</small><strong>{stats.totalModules.toLocaleString('pt-BR')}</strong><p>trilhas organizadas</p></div></article>
                <article><span className="blue"><Video /></span><div><small>Aulas ao vivo</small><strong>{stats.totalLiveClasses.toLocaleString('pt-BR')}</strong><p>encontros cadastrados</p></div></article>
            </section>

            <div className="admin-overview-primary-grid">
                <section className="admin-overview-panel admin-course-chart">
                    <header><div><span>Aprendizagem</span><h2>Alunos por curso</h2></div><button type="button" onClick={() => onSelectTab('reports')}>Ver relatório <ChevronDown size={14} /></button></header>
                    <div className="admin-course-bars">
                        {courseRows.length === 0 ? <p className="admin-overview-empty">Ainda não há cursos com matrículas.</p> : courseRows.map((course, index) => (
                            <div key={course.id}><span>{course.name}</span><div><i style={{ width: `${Math.max(6, (course.totalStudents / maxCourseStudents) * 100)}%`, '--bar-index': index } as CSSProperties} /></div><strong>{course.totalStudents}</strong></div>
                        ))}
                    </div>
                </section>

                <section className="admin-overview-panel admin-live-activity">
                    <header><div><span>Auditoria</span><h2>Atividade em tempo real</h2></div><em><i /> Online agora</em></header>
                    <div>
                        {auditLogs.length === 0 ? <p className="admin-overview-empty">Nenhuma ação recente registrada.</p> : auditLogs.slice(0, 5).map(log => (
                            <article key={log.id}><span><Activity size={16} /></span><div><small>{auditActionLabel(log.action)}</small><strong>{log.user?.name || 'Sistema'}</strong><p>{log.target || log.details || 'Ação auditada'}</p></div><time>{new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></article>
                        ))}
                    </div>
                    <button type="button" className="admin-panel-link" onClick={() => onSelectTab('audit')}>Ver todas as atividades <ChevronDown size={14} /></button>
                </section>
            </div>

            <div className="admin-overview-secondary-grid">
                <section className="admin-overview-panel admin-course-table-panel">
                    <header><div><span>Conteúdo</span><h2>Cursos com maior alcance</h2></div><Library size={19} /></header>
                    <div className="admin-overview-table-wrap"><table><thead><tr><th>Curso</th><th>Alunos</th><th>Aulas</th><th>Conclusão</th></tr></thead><tbody>{courseRows.map(course => <tr key={course.id}><td>{course.name}</td><td>{course.totalStudents}</td><td>{course.totalVideos}</td><td><span>{course.completionRate}%</span></td></tr>)}</tbody></table></div>
                    <button type="button" className="admin-panel-link" onClick={() => onSelectTab('courses')}>Ver todos os cursos <ChevronDown size={14} /></button>
                </section>

                <section className="admin-overview-panel admin-health-panel">
                    <header><div><span>Infraestrutura</span><h2>Saúde da plataforma</h2></div><Server size={19} /></header>
                    <div className="admin-health-list">
                        <article><span><Database /></span><div><strong>Banco de dados</strong><small>Persistência principal</small></div><em className={healthData?.services.database === 'up' ? 'ok' : 'error'}>{healthData?.services.database === 'up' ? 'Operacional' : 'Indisponível'}</em></article>
                        <article><span><FileVideo /></span><div><strong>Armazenamento</strong><small>Vídeos e documentos</small></div><em className={healthData?.services.storage === 'up' ? 'ok' : 'error'}>{healthData?.services.storage === 'up' ? 'Operacional' : 'Indisponível'}</em></article>
                        <article><span><Clock3 /></span><div><strong>Tempo online</strong><small>Processo da aplicação</small></div><em>{healthData ? `${Math.floor(healthData.uptime / 3600)}h` : '—'}</em></article>
                    </div>
                    <button type="button" className="admin-panel-link" onClick={() => onSelectTab('audit')}>Abrir observabilidade <ChevronDown size={14} /></button>
                </section>

                <section className="admin-overview-panel admin-pending-panel">
                    <header><div><span>Operação</span><h2>Pendências</h2></div><AlertTriangle size={19} /></header>
                    <div>
                        <button type="button" onClick={() => onSelectTab('courses')}><Upload /><span>Vídeos processando</span><strong>{stats.processingVideos}</strong></button>
                        <button type="button" onClick={() => onSelectTab('courses')}><Clock3 /><span>Vídeos pendentes</span><strong>{stats.pendingVideos}</strong></button>
                        <button type="button" onClick={() => onSelectTab('courses')}><AlertCircle /><span>Falhas de mídia</span><strong className="danger">{stats.errorVideos}</strong></button>
                        <button type="button" onClick={() => onSelectTab('moderation')}><MessageCircle /><span>Itens em moderação</span><strong>{flaggedTotal}</strong></button>
                    </div>
                </section>
            </div>

            <section className="admin-quick-summary">
                <h2>Resumo rápido</h2><div>
                    <article><Users /><span><small>Usuários cadastrados</small><strong>{userTotal.toLocaleString('pt-BR')}</strong></span></article>
                    <article><UserCog /><span><small>Professores</small><strong>{teacherTotal}</strong></span></article>
                    <article><FileVideo /><span><small>Conteúdos</small><strong>{stats.totalVideos}</strong></span></article>
                    <article><Activity /><span><small>Eventos recentes</small><strong>{auditLogs.length}</strong></span></article>
                </div>
            </section>
        </div>
    );
}
