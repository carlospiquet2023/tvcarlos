import { CheckCircle, Flag, ShieldCheck, Trash2 } from 'lucide-react';
import type { FlaggedComment } from '../types';

interface AdminModerationProps {
    comments: FlaggedComment[];
    page: number;
    totalPages: number;
    onApprove: (id: string) => Promise<void>;
    onPageChange: (page: number) => void;
    onRemove: (id: string) => Promise<void>;
}

export function AdminModeration({ comments, page, totalPages, onApprove, onPageChange, onRemove }: AdminModerationProps) {
    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">Moderação de Comentários</h2>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Comentários flagrados automaticamente pelo filtro de profanidade ou denunciados por alunos.</p>
            {comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><ShieldCheck size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} /><h3>Tudo limpo!</h3><p>Nenhum comentário pendente de moderação.</p></div>
            ) : (
                <div className="admin-moderation-list">{comments.map(comment => (
                    <div key={comment.id} className="admin-mod-card">
                        <div className="admin-mod-header"><div className="admin-mod-user"><strong>{comment.user.name}</strong><span className="admin-mod-role">{comment.user.role}</span><span className="admin-mod-time">{new Date(comment.createdAt).toLocaleString('pt-BR')}</span></div><div className="admin-mod-lesson">{comment.video.module.course.name} → {comment.video.title}</div></div>
                        <div className="admin-mod-text">{comment.text}</div>
                        {comment.flagged && <span className="admin-mod-flag auto"><Flag size={12} /> Filtro automático</span>}
                        {comment.reports.length > 0 && <div className="admin-mod-reports"><strong><Flag size={12} /> {comment.reports.length} denúncia(s):</strong>{comment.reports.map(report => <div key={report.id} className="admin-mod-report-item"><span>{report.user.name}:</span> {report.reason}</div>)}</div>}
                        <div className="admin-mod-actions"><button className="admin-btn admin-btn-sm admin-btn-success" onClick={() => void onApprove(comment.id)}><CheckCircle size={14} /> Aprovar</button><button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => void onRemove(comment.id)}><Trash2 size={14} /> Remover</button></div>
                    </div>
                ))}</div>
            )}
            {totalPages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</button></div>}
        </div>
    );
}
