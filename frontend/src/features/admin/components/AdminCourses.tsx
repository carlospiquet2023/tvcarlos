import type { FormEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Edit3, Eye, FileDown, Plus, RefreshCw, Trash2, Upload, Users, X } from 'lucide-react';
import { resolveMediaUrl } from '../../../lib/urls';
import type { ConfirmationRequest, CourseData, EnrollmentForm, NewCourseForm, NewModuleForm, UserData, VideoData, VideoUploadForm } from '../types';

interface AdminCoursesProps {
    courses: CourseData[];
    editingVideoId: string | null;
    enrollment: EnrollmentForm;
    isTeacher: boolean;
    moduleForm: NewModuleForm;
    courseForm: NewCourseForm;
    upload: VideoUploadForm;
    uploadProgress: number;
    uploading: boolean;
    uploadingImage: boolean;
    users: UserData[];
    onCourseFormChange: (form: NewCourseForm) => void;
    onCourseThumbnailUpload: (file: File) => Promise<void>;
    onCreateCourse: (event: FormEvent) => void;
    onCreateModule: (event: FormEvent) => void;
    onDeleteCourse: (id: string) => Promise<void>;
    onDeleteModule: (id: string) => Promise<void>;
    onDeleteVideo: (id: string) => Promise<void>;
    onEnroll: (event: FormEvent, courseId: string) => Promise<void>;
    onEnrollAll: (courseId: string) => Promise<void>;
    onEnrollmentChange: (form: EnrollmentForm) => void;
    onModuleFormChange: (form: NewModuleForm) => void;
    onOpenVideoEditor: (video: VideoData) => void;
    onRemoveCalendar: (courseId: string) => Promise<void>;
    onRemoveEnrollment: (enrollmentId: string) => Promise<void>;
    onRemoveModulePdf: (moduleId: string) => Promise<void>;
    onReorderCourse: (courseId: string, direction: 'up' | 'down') => Promise<void>;
    onReprocessVideo: (videoId: string) => Promise<void>;
    onRequestConfirmation: ConfirmationRequest;
    onUploadCalendar: (courseId: string, file: File) => Promise<void>;
    onUploadChange: (upload: VideoUploadForm | ((current: VideoUploadForm) => VideoUploadForm)) => void;
    onUploadModulePdf: (moduleId: string, file: File) => Promise<void>;
    onUploadVideo: (event: FormEvent) => void;
}

export function AdminCourses({
    courses,
    editingVideoId,
    enrollment,
    isTeacher,
    moduleForm,
    courseForm,
    upload,
    uploadProgress,
    uploading,
    uploadingImage,
    users,
    onCourseFormChange,
    onCourseThumbnailUpload,
    onCreateCourse,
    onCreateModule,
    onDeleteCourse,
    onDeleteModule,
    onDeleteVideo,
    onEnroll,
    onEnrollAll,
    onEnrollmentChange,
    onModuleFormChange,
    onOpenVideoEditor,
    onRemoveCalendar,
    onRemoveEnrollment,
    onRemoveModulePdf,
    onReorderCourse,
    onReprocessVideo,
    onRequestConfirmation,
    onUploadCalendar,
    onUploadChange,
    onUploadModulePdf,
    onUploadVideo
}: AdminCoursesProps) {
    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">{isTeacher ? 'Meus Cursos' : 'Gerenciar Cursos'}</h2>

            {!isTeacher && (
                <div className="admin-card">
                    <h3>Criar Novo Curso</h3>
                    <form onSubmit={onCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <div className="admin-form-row">
                            <input placeholder="Nome do Curso (Ex: Módulo Intensivo OAB)" value={courseForm.name} onChange={event => onCourseFormChange({ ...courseForm, name: event.target.value })} required className="admin-input" style={{ flex: 2 }} />
                            <input placeholder="Descrição" value={courseForm.description} onChange={event => onCourseFormChange({ ...courseForm, description: event.target.value })} className="admin-input" style={{ flex: 2 }} />
                        </div>
                        <div className="admin-form-row" style={{ alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}><Upload size={16} /> Thumbnail:</label>
                            <input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void onCourseThumbnailUpload(file); }} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }} />
                            {courseForm.thumbnailUrl && <img src={resolveMediaUrl(courseForm.thumbnailUrl)} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />}
                            <button type="submit" disabled={uploadingImage} className="admin-btn-primary"><Plus size={16} /> Salvar</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {courses.map(course => (
                    <div key={course.id} className="admin-course-card">
                        <div className="admin-course-header">
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                {!isTeacher && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <button onClick={() => void onReorderCourse(course.id, 'up')} className="admin-btn-icon" title="Mover para cima" style={{ padding: '0.2rem' }}><ChevronUp size={16} /></button>
                                        <button onClick={() => void onReorderCourse(course.id, 'down')} className="admin-btn-icon" title="Mover para baixo" style={{ padding: '0.2rem' }}><ChevronDown size={16} /></button>
                                    </div>
                                )}
                                {course.thumbnailUrl && <img src={resolveMediaUrl(course.thumbnailUrl)} alt={course.name} className="admin-course-thumb" />}
                                <div><h3 className="admin-course-name">{course.name}</h3><p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{course.description}</p></div>
                            </div>
                            {!isTeacher && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <label className="admin-btn-calendar" title="Upload Calendário PDF">
                                        <CalendarDays size={16} />{course.calendarUrl ? 'Trocar Calendário' : 'Calendário PDF'}
                                        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadCalendar(course.id, file); }} />
                                    </label>
                                    {course.calendarUrl && (
                                        <>
                                            <a href={resolveMediaUrl(course.calendarUrl)} target="_blank" rel="noopener noreferrer" className="admin-btn-icon primary" title="Ver Calendário"><Eye size={16} /></a>
                                            <button onClick={() => void onRemoveCalendar(course.id)} className="admin-btn-icon danger" title="Remover Calendário"><X size={16} /></button>
                                        </>
                                    )}
                                    <button onClick={() => onRequestConfirmation(`Deletar curso "${course.name}"? Todos os módulos e vídeos serão removidos.`, () => void onDeleteCourse(course.id))} className="admin-btn-danger"><Trash2 size={18} /> Deletar Curso</button>
                                </div>
                            )}
                        </div>

                        <div className={isTeacher ? '' : 'admin-course-grid'}>
                            <div>
                                <h4 className="admin-section-label">Grade Curricular (Módulos e Aulas)</h4>
                                <form onSubmit={onCreateModule} className="admin-form-row" style={{ marginBottom: '1.5rem' }}>
                                    <input placeholder="Nome do Novo Módulo" required value={moduleForm.courseId === course.id ? moduleForm.name : ''} onChange={event => onModuleFormChange({ courseId: course.id, name: event.target.value })} className="admin-input" />
                                    <button type="submit" disabled={!moduleForm.name || moduleForm.courseId !== course.id} className="admin-btn-success"><Plus size={16} /> Módulo</button>
                                </form>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {course.modules.map(module => (
                                        <div key={module.id} className="admin-module-block">
                                            <div className="admin-module-header">
                                                <strong className="admin-module-name">{module.name}</strong>
                                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    <label className="admin-btn-icon primary" title="Upload Material PDF" style={{ cursor: 'pointer' }}>
                                                        <FileDown size={16} />
                                                        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) void onUploadModulePdf(module.id, file); }} />
                                                    </label>
                                                    {module.pdfUrl && (
                                                        <>
                                                            <a href={resolveMediaUrl(module.pdfUrl)} target="_blank" rel="noopener noreferrer" className="admin-pdf-badge" title="PDF anexado — clique para ver">📄 PDF</a>
                                                            <button onClick={() => void onRemoveModulePdf(module.id)} className="admin-btn-icon danger" title="Remover PDF"><X size={14} /></button>
                                                        </>
                                                    )}
                                                    <button onClick={() => onRequestConfirmation(`Deletar módulo "${module.name}"? Vídeos serão removidos.`, () => void onDeleteModule(module.id))} className="admin-btn-icon danger"><Trash2 size={16} /></button>
                                                </div>
                                            </div>

                                            <div style={{ padding: '1rem' }}>
                                                {module.videos.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                                        {module.videos.map(video => (
                                                            <div key={video.id} className="admin-video-item">
                                                                <div className="admin-video-row">
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                                                        <span style={{ color: 'var(--text-muted)' }}>Aula {video.order + 1}</span><span className="admin-video-title">{video.title}</span>
                                                                        {video.status === 'READY' ? <span className="admin-status-badge ready">PRONTO</span> : video.status === 'PROCESSING' ? <span className="admin-status-badge processing">PROCESSANDO</span> : video.status === 'PENDING' ? <span className="admin-status-badge processing">PENDENTE</span> : <span className="admin-status-badge error">ERRO</span>}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                        <button onClick={() => onOpenVideoEditor(video)} className="admin-btn-icon primary"><Edit3 size={14} /></button>
                                                                        {!isTeacher && (video.status === 'ERROR' || video.status === 'PENDING') && <button onClick={() => onRequestConfirmation('Reprocessar este vídeo?', () => void onReprocessVideo(video.id))} className="admin-btn-icon primary" title="Reprocessar"><RefreshCw size={14} /></button>}
                                                                        {!isTeacher && <button onClick={() => onRequestConfirmation(`Deletar vídeo "${video.title}"?`, () => void onDeleteVideo(video.id))} className="admin-btn-icon danger"><Trash2 size={14} /></button>}
                                                                    </div>
                                                                </div>
                                                                {editingVideoId === video.id && <div className="admin-edit-inline-badge"><Edit3 size={12} /> Editando — modal aberto</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', fontStyle: 'italic' }}>Nenhuma aula neste módulo.</p>}

                                                <form onSubmit={onUploadVideo} className="admin-upload-zone">
                                                    <span className="admin-upload-label">Adicionar Nova Aula</span>
                                                    <input placeholder="Título do Vídeo" required value={upload.moduleId === module.id ? upload.title : ''} onChange={event => onUploadChange({ ...upload, moduleId: module.id, title: event.target.value })} className="admin-input-sm" />
                                                    <div className="admin-form-row">
                                                        <input type="file" accept="video/mp4,video/mkv" required onChange={event => { const file = event.target.files?.[0]; if (file) onUploadChange(current => ({ ...current, moduleId: module.id, file })); }} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }} />
                                                        <button type="submit" disabled={uploading || upload.moduleId !== module.id} className="admin-btn-primary-sm">{uploading && upload.moduleId === module.id ? 'Enviando...' : 'Upload MP4'}</button>
                                                    </div>
                                                    {uploading && upload.moduleId === module.id && uploadProgress > 0 && <div className="upload-progress-bar"><div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} /><span className="upload-progress-text">{uploadProgress}%</span></div>}
                                                </form>
                                            </div>
                                        </div>
                                    ))}
                                    {course.modules.length === 0 && <div className="admin-empty-box">Nenhum módulo criado. Crie um módulo primeiro para adicionar aulas.</div>}
                                </div>
                            </div>

                            {!isTeacher && (
                                <div>
                                    <h4 className="admin-section-label">Alunos Matriculados</h4>
                                    <form onSubmit={event => void onEnroll(event, course.id)} className="admin-form-row" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <select required value={enrollment.courseId === course.id ? enrollment.userId : ''} onChange={event => onEnrollmentChange({ ...enrollment, courseId: course.id, userId: event.target.value })} className="admin-select" style={{ flex: 2 }}>
                                            <option value="">Selecione um usuário...</option>
                                            {users.filter(user => user.role === 'STUDENT' || user.role === 'TEACHER').map(user => <option key={user.id} value={user.id}>{user.name} ({user.email}) — {user.role === 'TEACHER' ? 'Professor' : 'Aluno'}</option>)}
                                        </select>
                                        <select value={enrollment.courseId === course.id ? (enrollment.enrollmentRole || 'STUDENT') : 'STUDENT'} onChange={event => onEnrollmentChange({ ...enrollment, courseId: course.id, enrollmentRole: event.target.value })} className="admin-select" style={{ flex: 1 }}><option value="STUDENT">Aluno</option><option value="TEACHER">Professor</option></select>
                                        <button type="submit" disabled={!enrollment.userId || enrollment.courseId !== course.id} className="admin-btn-primary">Matricular</button>
                                    </form>
                                    <button onClick={() => onRequestConfirmation('Matricular TODOS os alunos neste curso?', () => void onEnrollAll(course.id))} className="admin-btn-primary" style={{ marginBottom: '1.5rem', background: 'var(--accent, #ec4899)', width: '100%' }}><Users size={14} /> Matricular Todos os Alunos</button>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {course.enrollments.length > 0 ? course.enrollments.map(item => (
                                            <div key={item.id} className="admin-enrollment-item">
                                                <div><strong style={{ fontSize: '0.95rem' }}>{item.user.name}</strong><span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.enrollmentRole === 'TEACHER' ? 'var(--accent, #8b5cf6)' : 'var(--primary, #3b82f6)', color: '#fff', marginLeft: '0.4rem' }}>{item.enrollmentRole === 'TEACHER' ? 'Professor' : 'Aluno'}</span><span className="admin-enrollment-email">{item.user.email}</span></div>
                                                <button onClick={() => onRequestConfirmation(`Remover matrícula de ${item.user.name}?`, () => void onRemoveEnrollment(item.id))} className="admin-btn-icon danger" title="Remover Matrícula"><Trash2 size={16} /></button>
                                            </div>
                                        )) : <div className="admin-empty-box">Nenhum aluno matriculado neste curso.</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
