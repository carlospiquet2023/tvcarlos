import { Activity, Monitor, Settings } from 'lucide-react';
import type { AuditLogData, HealthData } from '../types';

interface AdminAuditProps {
    health: HealthData | null;
    logs: AuditLogData[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function AdminAudit({ health, logs, page, totalPages, onPageChange }: AdminAuditProps) {
    return (
        <div className="admin-fade-in">
            {health && (
                <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                        <div className="stat-icon"><Activity size={24} /></div>
                        <div className="stat-info"><h3>Uptime do Servidor</h3><div className="stat-value">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</div></div>
                    </div>
                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                        <div className="stat-icon"><Monitor size={24} /></div>
                        <div className="stat-info"><h3>Uso de Memória</h3><div className="stat-value">{Math.round(health.memory.process / 1024 / 1024)} MB</div></div>
                    </div>
                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                        <div className="stat-icon"><Settings size={24} /></div>
                        <div className="stat-info">
                            <h3>Status dos Serviços</h3>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: health.services.database === 'up' ? '#10b981' : '#ef4444' }} />DB</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: health.services.storage === 'up' ? '#10b981' : '#ef4444' }} />Storage</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <h2 className="admin-page-title">Audit Log</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Registro de todas as ações administrativas na plataforma.</p>
            <table className="admin-table">
                <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Alvo</th><th>Detalhes</th></tr></thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                            <td>{log.user?.name || '—'}</td>
                            <td><span className="admin-status-badge ready">{log.action}</span></td>
                            <td style={{ fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.target || '—'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.details || '—'}</td>
                        </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>}
                </tbody>
            </table>

            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                    <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>← Anterior</button>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
                    <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>Próxima →</button>
                </div>
            )}
        </div>
    );
}
