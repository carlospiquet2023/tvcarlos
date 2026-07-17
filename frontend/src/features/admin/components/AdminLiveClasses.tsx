import type { FormEvent } from 'react';
import { Edit3, ExternalLink, Plus, Save, Trash2, X } from 'lucide-react';
import type { CourseData, LiveClassData } from '../types';

export interface LiveClassForm {
    courseId: string;
    moduleId: string;
    title: string;
    description: string;
    startAt: string;
    endAt: string;
    zoomJoinUrl: string;
    zoomStartUrl: string;
    zoomMeetingId: string;
}

interface AdminLiveClassesProps {
    classes: LiveClassData[];
    courses: CourseData[];
    editingId: string | null;
    editingStatus: string;
    form: LiveClassForm;
    onCreate: (event: FormEvent) => void;
    onDelete: (id: string, title: string) => void;
    onEditingChange: (id: string | null, status?: string) => void;
    onFormChange: (form: LiveClassForm) => void;
    onStatusChange: (status: string) => void;
    onUpdate: (id: string) => void;
}

export function AdminLiveClasses({ classes, courses, editingId, editingStatus, form, onCreate, onDelete, onEditingChange, onFormChange, onStatusChange, onUpdate }: AdminLiveClassesProps) {
    const update = (field: keyof LiveClassForm, value: string) => onFormChange({ ...form, [field]: value });

    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">Aulas ao Vivo (Zoom)</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Agende aulas ao vivo e compartilhe o link do Zoom com os alunos matriculados.</p>

            <div className="admin-card" style={{ marginBottom: '2rem' }}>
                <h3>Agendar Nova Aula ao Vivo</h3>
                <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <select value={form.courseId} onChange={event => onFormChange({ ...form, courseId: event.target.value, moduleId: '' })} required className="admin-input">
                            <option value="">Selecionar Curso *</option>
                            {courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                        </select>
                        <select value={form.moduleId} onChange={event => update('moduleId', event.target.value)} className="admin-input">
                            <option value="">Módulo (opcional)</option>
                            {courses.find(course => course.id === form.courseId)?.modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
                        </select>
                    </div>
                    <input placeholder="Título da aula *" value={form.title} onChange={event => update('title', event.target.value)} required className="admin-input" />
                    <input placeholder="Descrição (opcional)" value={form.description} onChange={event => update('description', event.target.value)} className="admin-input" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Data/Hora Início *<input type="datetime-local" value={form.startAt} onChange={event => update('startAt', event.target.value)} required className="admin-input" style={{ display: 'block', marginTop: '0.25rem' }} /></label>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Data/Hora Fim (opcional)<input type="datetime-local" value={form.endAt} onChange={event => update('endAt', event.target.value)} className="admin-input" style={{ display: 'block', marginTop: '0.25rem' }} /></label>
                    </div>
                    <input placeholder="Link do Zoom (Join URL) *" value={form.zoomJoinUrl} onChange={event => update('zoomJoinUrl', event.target.value)} required className="admin-input" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <input placeholder="Link do Host (Start URL, opcional)" value={form.zoomStartUrl} onChange={event => update('zoomStartUrl', event.target.value)} className="admin-input" />
                        <input placeholder="Meeting ID (opcional)" value={form.zoomMeetingId} onChange={event => update('zoomMeetingId', event.target.value)} className="admin-input" />
                    </div>
                    <button type="submit" className="admin-btn-primary" style={{ alignSelf: 'flex-start' }}><Plus size={16} /> Agendar Aula ao Vivo</button>
                </form>
            </div>

            <div className="admin-card">
                <h3>Aulas Agendadas</h3>
                {classes.length === 0 ? <div className="admin-empty-box">Nenhuma aula ao vivo agendada.</div> : (
                    <div className="live-class-list">{classes.map(liveClass => (
                        <div key={liveClass.id} className={`live-class-item status-${liveClass.status.toLowerCase()}`}>
                            <div className="live-class-info">
                                <div className="live-class-header"><strong>{liveClass.title}</strong><span className={`live-status-badge ${liveClass.status.toLowerCase()}`}>{liveClass.status === 'SCHEDULED' ? '📅 Agendada' : liveClass.status === 'LIVE' ? '🔴 Ao Vivo' : liveClass.status === 'ENDED' ? '✅ Encerrada' : '🎬 Gravada'}</span></div>
                                <div className="live-class-meta"><span>📚 {liveClass.course?.name}</span>{liveClass.module && <span>📁 {liveClass.module.name}</span>}<span>🕐 {new Date(liveClass.startAt).toLocaleString('pt-BR')}</span>{liveClass.endAt && <span>→ {new Date(liveClass.endAt).toLocaleString('pt-BR')}</span>}</div>
                                {liveClass.zoomJoinUrl && <a href={liveClass.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="live-zoom-link"><ExternalLink size={14} /> Link do Zoom</a>}
                            </div>
                            <div className="live-class-actions">
                                {editingId === liveClass.id ? <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <select value={editingStatus} onChange={event => onStatusChange(event.target.value)} className="admin-input" style={{ width: 'auto', minWidth: '140px' }}><option value="SCHEDULED">Agendada</option><option value="LIVE">Ao Vivo</option><option value="ENDED">Encerrada</option></select>
                                    <button onClick={() => onUpdate(liveClass.id)} className="admin-btn-primary" style={{ padding: '0.4rem 0.75rem' }}><Save size={14} /></button>
                                    <button onClick={() => onEditingChange(null)} className="admin-btn-secondary" style={{ padding: '0.4rem 0.75rem' }}><X size={14} /></button>
                                </div> : <><button onClick={() => onEditingChange(liveClass.id, liveClass.status)} className="admin-btn-secondary" style={{ padding: '0.4rem 0.75rem' }} title="Alterar status"><Edit3 size={14} /></button><button onClick={() => onDelete(liveClass.id, liveClass.title)} className="admin-btn-danger" style={{ padding: '0.4rem 0.75rem' }} title="Remover"><Trash2 size={14} /></button></>}
                            </div>
                        </div>
                    ))}</div>
                )}
            </div>
        </div>
    );
}
