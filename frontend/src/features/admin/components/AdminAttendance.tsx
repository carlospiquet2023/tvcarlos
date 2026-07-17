import { Edit3, Eye, Save } from 'lucide-react';
import type { AttendanceData, CourseData, ModuleData } from '../types';

export interface AttendanceFilter {
    courseId: string;
    moduleId: string;
    date: string;
}

export interface AttendanceConfig {
    attendanceEnabled: boolean;
    attendanceMinMinutes: number;
    attendanceMode: string;
}

export interface AttendanceEditModal {
    id: string;
    userId: string;
    moduleId: string;
    date: string;
    currentStatus: string;
}

export interface AttendanceEditForm {
    status: string;
    justification: string;
}

interface AdminAttendanceProps {
    config: AttendanceConfig;
    courses: CourseData[];
    data: AttendanceData[];
    editForm: AttendanceEditForm;
    editModal: AttendanceEditModal | null;
    filter: AttendanceFilter;
    modules: ModuleData[];
    onBeginEdit: (attendance: AttendanceData) => void;
    onCloseEdit: () => void;
    onConfigChange: (config: AttendanceConfig) => void;
    onCourseChange: (courseId: string) => void;
    onEditFormChange: (form: AttendanceEditForm) => void;
    onFetch: () => void;
    onFilterChange: (filter: AttendanceFilter) => void;
    onSaveConfig: () => void;
    onSubmitEdit: () => void;
}

export function AdminAttendance({
    config,
    courses,
    data,
    editForm,
    editModal,
    filter,
    modules,
    onBeginEdit,
    onCloseEdit,
    onConfigChange,
    onCourseChange,
    onEditFormChange,
    onFetch,
    onFilterChange,
    onSaveConfig,
    onSubmitEdit
}: AdminAttendanceProps) {
    const presentCount = data.filter(attendance => attendance.status === 'PRESENT').length;

    return (
        <>
            <div className="admin-fade-in">
                <h2 className="admin-page-title">Controle de Presença</h2>

                <div className="admin-card" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Configurações de Presença</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Sistema de Presença</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={config.attendanceEnabled} onChange={event => onConfigChange({ ...config, attendanceEnabled: event.target.checked })} style={{ width: '18px', height: '18px' }} />
                                <span style={{ fontWeight: 600 }}>{config.attendanceEnabled ? 'Ativado' : 'Desativado'}</span>
                            </label>
                        </div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tempo Mínimo (minutos)
                            <input type="number" min={1} max={180} value={config.attendanceMinMinutes} onChange={event => onConfigChange({ ...config, attendanceMinMinutes: Number.parseInt(event.target.value, 10) || 20 })} className="admin-input" style={{ width: '120px', display: 'block', marginTop: '0.3rem' }} />
                        </label>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Modo
                            <select value={config.attendanceMode} onChange={event => onConfigChange({ ...config, attendanceMode: event.target.value })} className="admin-select" style={{ minWidth: '200px', display: 'block', marginTop: '0.3rem' }}>
                                <option value="DATE_ONLY">Somente na Data do Módulo</option>
                                <option value="FREE">Livre (Qualquer Data)</option>
                            </select>
                        </label>
                        <button onClick={onSaveConfig} className="admin-btn-primary"><Save size={16} /> Salvar Configuração</button>
                    </div>
                </div>

                <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Filtrar Presença</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Curso
                            <select value={filter.courseId} onChange={event => onCourseChange(event.target.value)} className="admin-select" style={{ minWidth: '250px', display: 'block', marginTop: '0.3rem' }}>
                                <option value="">Selecione um curso...</option>
                                {courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Módulo
                            <select value={filter.moduleId} onChange={event => onFilterChange({ ...filter, moduleId: event.target.value })} className="admin-select" style={{ minWidth: '250px', display: 'block', marginTop: '0.3rem' }} disabled={!filter.courseId}>
                                <option value="">Selecione um módulo...</option>
                                {modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Data
                            <input type="date" value={filter.date} onChange={event => onFilterChange({ ...filter, date: event.target.value })} className="admin-input" style={{ display: 'block', marginTop: '0.3rem' }} />
                        </label>
                        <button onClick={onFetch} disabled={!filter.moduleId || !filter.date} className="admin-btn-primary"><Eye size={16} /> Buscar</button>
                    </div>
                </div>

                {data.length > 0 ? (
                    <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3>Lista de Presença — {data.length} aluno(s)</h3>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}><span style={{ color: '#22c55e', fontWeight: 600 }}>✓ Presentes: {presentCount}</span><span style={{ color: '#ef4444', fontWeight: 600 }}>✗ Ausentes: {data.length - presentCount}</span></div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="admin-table">
                                <thead><tr><th>Aluno</th><th>Email</th><th>Tempo Assistido</th><th>Status</th><th>Detecção</th><th>Ações</th></tr></thead>
                                <tbody>{data.map(attendance => (
                                    <tr key={attendance.id || `absent-${attendance.userId}`}>
                                        <td>{attendance.user?.name || 'N/A'}</td><td>{attendance.user?.email || 'N/A'}</td>
                                        <td>{Math.floor((attendance.watchTimeSeconds || 0) / 60)}min {(attendance.watchTimeSeconds || 0) % 60}s</td>
                                        <td><span className={`admin-status-badge ${attendance.status === 'PRESENT' ? 'ready' : 'error'}`}>{attendance.status === 'PRESENT' ? '✓ Presente' : '✗ Ausente'}</span></td>
                                        <td>{attendance.autoDetected ? '🤖 Auto' : attendance.id ? '✏️ Manual' : '—'}</td>
                                        <td><button onClick={() => onBeginEdit(attendance)} className="admin-btn-icon primary" title="Editar presença"><Edit3 size={14} /></button>{attendance.edits && attendance.edits.length > 0 && <span title={attendance.edits.map(edit => `${edit.editedBy?.name}: ${edit.oldStatus}→${edit.newStatus} - ${edit.justification}`).join('\n')} style={{ marginLeft: '0.5rem', cursor: 'help', fontSize: '0.8rem', color: 'var(--text-muted)' }}>📝 {attendance.edits.length} edição(ões)</span>}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                ) : filter.moduleId && filter.date ? <div className="admin-empty-box">Nenhum registro de presença encontrado para este módulo e data.</div> : null}
            </div>

            {editModal && (
                <div className="modal-overlay" onClick={onCloseEdit}>
                    <div className="modal-content" onClick={event => event.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Editar Presença</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Status atual: <strong>{editModal.currentStatus === 'PRESENT' ? 'Presente' : 'Ausente'}</strong></p>
                        <label style={{ fontSize: '0.85rem' }}>Novo Status<select value={editForm.status} onChange={event => onEditFormChange({ ...editForm, status: event.target.value })} className="admin-select" style={{ display: 'block', margin: '0.3rem 0 1rem' }}><option value="PRESENT">Presente</option><option value="ABSENT">Ausente</option></select></label>
                        <label style={{ fontSize: '0.85rem' }}>Justificativa *<textarea value={editForm.justification} onChange={event => onEditFormChange({ ...editForm, justification: event.target.value })} className="admin-input" rows={3} placeholder="Motivo da alteração (obrigatório)..." required style={{ width: '100%', resize: 'vertical', display: 'block', marginTop: '0.3rem' }} /></label>
                        <small style={{ color: 'var(--text-muted)' }}>Esta justificativa será registrada no log de auditoria.</small>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}><button onClick={onCloseEdit} className="admin-btn-danger" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>Cancelar</button><button onClick={onSubmitEdit} disabled={!editForm.justification.trim()} className="admin-btn-primary"><Save size={16} /> Salvar</button></div>
                    </div>
                </div>
            )}
        </>
    );
}
