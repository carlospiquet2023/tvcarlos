import type { CourseReport } from '../types';

interface AdminReportsProps {
    reports: CourseReport[];
}

export function AdminReports({ reports }: AdminReportsProps) {
    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">Relatórios dos Cursos</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Visão geral de progresso e conclusão por curso.</p>

            <div className="admin-stats-grid" style={{ gap: '1.5rem' }}>
                {reports.map(report => (
                    <div key={report.id} className="admin-stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{report.name}</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{report.totalStudents} alunos</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{report.totalVideos} aulas</span>
                        </div>
                        <div className="report-progress-bar">
                            <div className="report-progress-fill" style={{ width: `${report.completionRate}%` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{report.completionRate}% conclusão</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{report.completedLessons}/{report.totalPossibleLessons} aulas</span>
                        </div>
                    </div>
                ))}
                {reports.length === 0 && <div className="admin-empty-box">Nenhum curso encontrado.</div>}
            </div>
        </div>
    );
}
