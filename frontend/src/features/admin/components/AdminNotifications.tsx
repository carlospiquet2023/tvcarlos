import type { FormEvent } from 'react';
import { AlertTriangle, Bell, CheckCircle } from 'lucide-react';
import type { EmailStatusData } from '../types';

export interface NotificationForm {
    title: string;
    message: string;
}

interface AdminNotificationsProps {
    emailStatus: EmailStatusData | null;
    feedback: string;
    form: NotificationForm;
    onChange: (form: NotificationForm) => void;
    onSubmit: (event: FormEvent) => void;
}

export function AdminNotifications({ emailStatus, feedback, form, onChange, onSubmit }: AdminNotificationsProps) {
    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">Enviar Notificação</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Envie um aviso para o painel e, quando o SMTP estiver ativo, também para o e-mail real dos alunos.</p>

            <div className="admin-card" style={{ marginBottom: '1rem', borderLeft: `4px solid ${emailStatus?.configured ? '#15803d' : '#d97706'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {emailStatus?.configured ? <CheckCircle size={20} color="#15803d" /> : <AlertTriangle size={20} color="#b45309" />}
                    <div>
                        <strong>{emailStatus?.configured ? 'Entrega por e-mail ativa' : 'Entrega por e-mail desativada'}</strong>
                        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {emailStatus?.configured
                                ? `Servidor ${emailStatus.host}:${emailStatus.port} · Remetente ${emailStatus.from}`
                                : `Configure no Railway: ${emailStatus?.missing?.join(', ') || 'carregando diagnóstico...'}. Os avisos continuam funcionando dentro da plataforma.`}
                        </p>
                    </div>
                </div>
            </div>

            <div className="admin-card">
                <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        placeholder="Título da notificação"
                        value={form.title}
                        onChange={event => onChange({ ...form, title: event.target.value })}
                        required
                        className="admin-input"
                    />
                    <textarea
                        placeholder="Mensagem..."
                        value={form.message}
                        onChange={event => onChange({ ...form, message: event.target.value })}
                        required
                        className="admin-input"
                        style={{ minHeight: '100px', resize: 'vertical' }}
                    />
                    <button type="submit" className="admin-btn-primary" style={{ alignSelf: 'flex-start' }}>
                        <Bell size={16} /> Enviar para todos os alunos
                    </button>
                    {feedback && <p role="status" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{feedback}</p>}
                </form>
            </div>
        </div>
    );
}
