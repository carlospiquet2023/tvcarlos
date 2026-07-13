import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { Users, BookOpen, Activity, Plus, Trash2, Settings, Save, Eye, EyeOff, CheckCircle, AlertCircle, Upload, Edit3, RefreshCw, Monitor, X, FileSpreadsheet, FileDown, CalendarDays, ClipboardList, BarChart3, Download, Bell, ChevronUp, ChevronDown, Video, ExternalLink, ShieldCheck, Flag, Ban, Scale, AlertTriangle, RadioTower, Key, School, Activity as ActivityIcon, Search, Menu, LogOut, UserCheck, FileVideo, Database, Server, Clock3, Layers3, UserCog, MessageCircle, Library } from 'lucide-react';
import axios from 'axios';
import api from '../lib/api';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import BlockEditor, { BlockRenderer, type ContentBlock, parseContentField } from '../components/BlockEditor';
import ConfirmModal from '../components/ConfirmModal';
import BroadcastAdminPanel from '../components/BroadcastAdminPanel';
import PrivateRoomAdminPanel from '../components/PrivateRoomAdminPanel';
import './AdminDashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface StatsData {
    totalUsers: number;
    totalCourses: number;
    totalVideos: number;
    processingVideos: number;
    readyVideos: number;
    pendingVideos: number;
    errorVideos: number;
}

interface UserData {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
}

interface ModuleData {
    id: string;
    name: string;
    pdfUrl: string | null;
    videos: VideoData[];
    order?: number;
}

interface VideoData { id: string; title: string; description: string | null; content: string | null; thumbnailUrl?: string | null; status: string; order: number; }
interface EnrollmentData { id: string; enrollmentRole: 'STUDENT' | 'TEACHER'; user: { id: string; name: string; email: string }; }

interface CourseData {
    id: string;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    calendarUrl: string | null;
    modules: ModuleData[];
    enrollments: EnrollmentData[];
    order?: number;
}

interface HealthData { uptime: number; memory: { process: number }; services: { database: string; storage: string }; }
interface AuditLogData { id: string; action: string; target?: string | null; details?: string | null; createdAt: string; user?: { name: string } | null; }
interface CourseReport { id: string; name: string; totalStudents: number; totalVideos: number; completionRate: number; completedLessons: number; totalPossibleLessons: number; }
interface LiveClassData { id: string; title: string; status: string; startAt: string; endAt?: string | null; zoomJoinUrl?: string | null; course?: { name: string } | null; module?: { name: string } | null; }
interface FlaggedComment { id: string; text: string; flagged: boolean; createdAt: string; user: { name: string; role: string }; video: { title: string; module: { course: { name: string } } }; reports: { id: string; reason: string; user: { name: string } }[]; }
interface ViolationData { id: string; word: string; severity: string; autoAction?: string | null; createdAt: string; user: { name: string }; }
interface BanData { id: string; active: boolean; banType: string; reason: string; createdAt: string; expiresAt?: string | null; user: { name: string }; }
interface AppealData { id: string; status: string; reason: string; adminNote?: string | null; createdAt: string; user: { name: string; email: string }; }
interface AttendanceEditData { oldStatus: string; newStatus: string; justification: string; editedBy?: { name: string } | null; }
interface AttendanceData { id?: string; userId: string; status: string; watchTimeSeconds?: number; autoDetected?: boolean; user?: { name: string; email: string }; edits?: AttendanceEditData[]; }

function roleLabel(role: string): string {
    return ({ ADMIN: 'Administrador', TEACHER: 'Professor', STUDENT: 'Aluno', STAFF: 'Equipe escolar', GUARDIAN: 'Responsável' } as Record<string, string>)[role] || role;
}

function auditActionLabel(action: string): string {
    return action.replace(/_/g, ' ').toLocaleLowerCase('pt-BR').replace(/^./, value => value.toUpperCase());
}

export default function AdminDashboard() {
    const { token, user, logout, login: doLogin } = useAuth();
    const { config } = useConfig();
    const isTeacher = user?.role === 'TEACHER';
    const [activeTab, setActiveTab] = useState(isTeacher ? 'courses' : 'overview');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [stats, setStats] = useState<StatsData | null>(null);
    const [users, setUsers] = useState<UserData[]>([]);
    const [courses, setCourses] = useState<CourseData[]>([]);

    // Paginação
    const [userPage, setUserPage] = useState(1);
    const [userTotalPages, setUserTotalPages] = useState(1);
    const [userTotal, setUserTotal] = useState(0);
    const [userSearch, setUserSearch] = useState('');
    const [userSearchInput, setUserSearchInput] = useState('');
    const [globalSearch, setGlobalSearch] = useState('');

    // Forms state
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'STUDENT' });
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editUserData, setEditUserData] = useState({ name: '', email: '', role: 'STUDENT', password: '' });
    const [newCourse, setNewCourse] = useState({ name: '', description: '', thumbnailUrl: '' });

    // Module, Video, Enrollment state
    const [newModule, setNewModule] = useState({ courseId: '', name: '' });
    const [uploadData, setUploadData] = useState<{ moduleId: string, title: string, file: File | null }>({ moduleId: '', title: '', file: null });
    const [uploading, setUploading] = useState(false);
    const [enrollmentData, setEnrollmentData] = useState({ courseId: '', userId: '', enrollmentRole: 'STUDENT' });

    // Video editing state
    const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
    const [editVideoData, setEditVideoData] = useState({ title: '', description: '', content: '' });
    const [editBlocks, setEditBlocks] = useState<ContentBlock[]>([]);
    const [uploadingImage, setUploadingImage] = useState(false);

    const [editorModalMode, setEditorModalMode] = useState<'edit' | 'preview'>('edit');

    // Excel upload state
    const [excelUploading, setExcelUploading] = useState(false);
    const [excelResults, setExcelResults] = useState<{ name: string; email: string; password: string; enrolled: string[]; error?: string }[] | null>(null);

    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => void } | null>(null);
    // Upload progress
    const [uploadProgress, setUploadProgress] = useState(0);

    // Audit log state
    const [healthData, setHealthData] = useState<HealthData | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotalPages, setAuditTotalPages] = useState(1);

    // Reports state
    const [reports, setReports] = useState<CourseReport[]>([]);

    // Notification broadcast state
    const [notifForm, setNotifForm] = useState({ title: '', message: '' });

    // Live Classes state
    const [liveClasses, setLiveClasses] = useState<LiveClassData[]>([]);
    const [liveForm, setLiveForm] = useState({ courseId: '', moduleId: '', title: '', description: '', startAt: '', endAt: '', zoomJoinUrl: '', zoomStartUrl: '', zoomMeetingId: '' });
    const [editingLiveId, setEditingLiveId] = useState<string | null>(null);
    const [editingLiveStatus, setEditingLiveStatus] = useState('');

    // Moderation state
    const [flaggedComments, setFlaggedComments] = useState<FlaggedComment[]>([]);
    const [flaggedTotal, setFlaggedTotal] = useState(0);
    const [flaggedPage, setFlaggedPage] = useState(1);
    const [flaggedTotalPages, setFlaggedTotalPages] = useState(1);

    // Punishment state
    const [violations, setViolations] = useState<ViolationData[]>([]);
    const [bans, setBans] = useState<BanData[]>([]);
    const [appeals, setAppeals] = useState<AppealData[]>([]);
    const [appealFilter, setAppealFilter] = useState('PENDING');
    const [punishmentEnabled, setPunishmentEnabled] = useState(false);
    const [manualBanForm, setManualBanForm] = useState({ userId: '', reason: '', banType: 'TEMP_1D' });

    // Attendance state
    const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
    const [attendanceFilter, setAttendanceFilter] = useState({ courseId: '', moduleId: '', date: new Date().toISOString().split('T')[0] });
    const [attendanceModules, setAttendanceModules] = useState<ModuleData[]>([]);
    const [attendanceEditModal, setAttendanceEditModal] = useState<{ id: string; userId: string; moduleId: string; date: string; currentStatus: string } | null>(null);
    const [attendanceEditForm, setAttendanceEditForm] = useState({ status: '', justification: '' });
    const [attendanceConfig, setAttendanceConfig] = useState({ attendanceEnabled: false, attendanceMinMinutes: 20, attendanceMode: 'FREE' });

    // Settings state
    const [settingsForm, setSettingsForm] = useState({
        currentPassword: '',
        newUsername: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showCurrentPass, setShowCurrentPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Global Branding State
    const [brandingForm, setBrandingForm] = useState({
        platformName: '',
        namePart1: '',
        namePart2: '',
        nameColor1: '#e50914',
        nameColor2: '#172033',
        primaryColor: '#6366f1',
        accentColor: '#ec4899',
        logoUrl: '',
        bannerUrl: ''
    });
    const [brandingMsg, setBrandingMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [brandingLoading, setBrandingLoading] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const headers = { Authorization: `Bearer ${token}` };
            if (activeTab === 'overview') {
                const [statsRes, usersRes, coursesRes, auditRes, healthRes, reportsRes, liveRes] = await Promise.all([
                    api.get('/api/admin/stats', { headers }),
                    api.get('/api/admin/users', { headers, params: { page: 1, limit: 100 } }),
                    api.get('/api/admin/courses', { headers }),
                    api.get('/api/admin/audit-log', { headers, params: { page: 1, limit: 8 } }),
                    api.get('/api/admin/health', { headers }),
                    api.get('/api/admin/reports', { headers }),
                    api.get('/api/admin/live-classes', { headers })
                ]);
                setStats(statsRes.data);
                setUsers(usersRes.data.data);
                setUserTotal(usersRes.data.total);
                setCourses(coursesRes.data.data);
                setAuditLogs(auditRes.data.data);
                setHealthData(healthRes.data);
                setReports(reportsRes.data);
                setLiveClasses(liveRes.data);
            } else if (activeTab === 'users') {
                const res = await api.get('/api/admin/users', { headers, params: { page: userPage, limit: 50, search: userSearch } });
                setUsers(res.data.data);
                setUserTotalPages(res.data.totalPages);
                setUserTotal(res.data.total);
            } else if (activeTab === 'courses') {
                if (isTeacher) {
                    const coursesRes = await api.get('/api/admin/courses', { headers });
                    setCourses(coursesRes.data.data);
                } else {
                    const [coursesRes, usersRes] = await Promise.all([
                        api.get('/api/admin/courses', { headers }),
                        api.get('/api/admin/users', { headers, params: { limit: 100 } })
                    ]);
                    setCourses(coursesRes.data.data);
                    setUsers(usersRes.data.data);
                }
            } else if (activeTab === 'settings') {
                const res = await api.get('/api/admin/config', { headers });
                setBrandingForm({
                    platformName: res.data.platformName || 'EduVault',
                    namePart1: res.data.namePart1 || 'Edu',
                    namePart2: res.data.namePart2 || 'Vault',
                    nameColor1: res.data.nameColor1 || '#e50914',
                    nameColor2: res.data.nameColor2 || '#172033',
                    primaryColor: res.data.primaryColor || '#6366f1',
                    accentColor: res.data.accentColor || '#ec4899',
                    logoUrl: res.data.logoUrl || '',
                    bannerUrl: res.data.bannerUrl || ''
                });
            } else if (activeTab === 'audit') {
                const [auditRes, healthRes] = await Promise.all([
                    api.get('/api/admin/audit-log', { headers, params: { page: auditPage, limit: 50 } }),
                    api.get('/api/admin/health', { headers })
                ]);
                setAuditLogs(auditRes.data.data);
                setAuditTotalPages(auditRes.data.totalPages);
                setHealthData(healthRes.data);
            } else if (activeTab === 'reports') {
                const res = await api.get('/api/admin/reports', { headers });
                setReports(res.data);
            } else if (activeTab === 'live') {
                const [liveRes, coursesRes] = await Promise.all([
                    api.get('/api/admin/live-classes', { headers }),
                    api.get('/api/admin/courses', { headers })
                ]);
                setLiveClasses(liveRes.data);
                setCourses(coursesRes.data.data);
            } else if (activeTab === 'moderation') {
                const res = await api.get('/api/admin/comments/flagged', { headers, params: { page: flaggedPage, limit: 20 } });
                setFlaggedComments(res.data.comments);
                setFlaggedTotal(res.data.total);
                setFlaggedTotalPages(res.data.totalPages);
            } else if (activeTab === 'punishment') {
                const [violRes, bansRes, appealsRes, configRes, usersRes] = await Promise.all([
                    api.get('/api/admin/violations', { headers }),
                    api.get('/api/admin/bans', { headers }),
                    api.get('/api/admin/appeals', { headers, params: { status: appealFilter } }),
                    api.get('/api/admin/config', { headers }),
                    api.get('/api/admin/users', { headers, params: { limit: 200 } })
                ]);
                setViolations(violRes.data);
                setBans(bansRes.data);
                setAppeals(appealsRes.data);
                setPunishmentEnabled(configRes.data.forumPunishmentEnabled ?? false);
                setUsers(usersRes.data.data);
            } else if (activeTab === 'attendance') {
                const [coursesRes, configRes] = await Promise.all([
                    api.get('/api/admin/courses', { headers }),
                    api.get('/api/admin/config', { headers })
                ]);
                setCourses(coursesRes.data.data);
                setAttendanceConfig({
                    attendanceEnabled: configRes.data.attendanceEnabled ?? false,
                    attendanceMinMinutes: configRes.data.attendanceMinMinutes ?? 20,
                    attendanceMode: configRes.data.attendanceMode ?? 'FREE'
                });

                // Se já existe filtro, buscar presenças
                if (attendanceFilter.moduleId && attendanceFilter.date) {
                    const attRes = await api.get('/api/admin/attendance', {
                        headers,
                        params: { moduleId: attendanceFilter.moduleId, date: attendanceFilter.date }
                    });
                    setAttendanceData(attRes.data);
                }
            }
        } catch (error) { console.error('Error fetching admin data', error); }
    }, [token, activeTab, userPage, userSearch, auditPage, flaggedPage, appealFilter, isTeacher, attendanceFilter.moduleId, attendanceFilter.date]);

    useEffect(() => {
        if (!token) return;
        fetchData();
    }, [token, activeTab, fetchData]);

    // Reseta página ao mudar a busca de usuários
    useEffect(() => {
        setUserPage(1);
    }, [userSearch]);

    // Preenche o username atual quando abre a tab
    useEffect(() => {
        if (activeTab === 'settings' && user?.username) {
            setSettingsForm(prev => ({ ...prev, newUsername: user.username || '' }));
        }
    }, [activeTab, user]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/admin/users', newUser, { headers: { Authorization: `Bearer ${token}` } });
            setNewUser({ name: '', email: '', password: '', role: 'STUDENT' });
            fetchData();
            alert('Usuário criado com sucesso!');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro');
            } else {
                alert('Erro desconhecido');
            }
        }
    };

    const handleDeleteUser = async (id: string) => {
        try {
            await api.delete(`/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch { alert('Erro ao deletar'); }
    };

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/admin/courses', newCourse, { headers: { Authorization: `Bearer ${token}` } });
            setNewCourse({ name: '', description: '', thumbnailUrl: '' });
            fetchData();
            alert('Curso criado com sucesso!');
        } catch { alert('Erro ao criar curso'); }
    };

    const handleDeleteCourse = async (id: string) => {
        try {
            await api.delete(`/api/admin/courses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch { alert('Erro ao deletar curso'); }
    };

    const handleCreateModule = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/admin/modules', newModule, { headers: { Authorization: `Bearer ${token}` } });
            setNewModule({ courseId: '', name: '' });
            fetchData();
            alert('Módulo criado com sucesso!');
        } catch { alert('Erro ao criar módulo'); }
    };

    const handleDeleteModule = async (id: string) => {
        try {
            await api.delete(`/api/admin/modules/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch { alert('Erro ao deletar módulo'); }
    };

    const handleUploadVideo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadData.file || !uploadData.moduleId || !uploadData.title) {
            alert('Preencha título, módulo e selecione o arquivo de vídeo.');
            return;
        }

        const formData = new FormData();
        formData.append('video', uploadData.file);
        formData.append('title', uploadData.title);
        formData.append('moduleId', uploadData.moduleId);

        try {
            setUploading(true);
            setUploadProgress(0);
            await api.post('/api/videos/upload', formData, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                    }
                }
            });
            setUploadData({ moduleId: '', title: '', file: null });
            fetchData();
            alert('Vídeo enviado e na fila de processamento!');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro no upload do vídeo');
            } else {
                alert('Erro desconhecido durante o upload');
            }
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleDeleteVideo = async (id: string) => {
        try {
            await api.delete(`/api/admin/videos/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch { alert('Erro ao deletar vídeo'); }
    };

    const handleEnrollStudent = async (e: React.FormEvent, courseId: string) => {
        e.preventDefault();
        if (!enrollmentData.userId) return;
        try {
            await api.post('/api/admin/enrollments', {
                courseId,
                userId: enrollmentData.userId,
                enrollmentRole: enrollmentData.enrollmentRole || 'STUDENT'
            }, { headers: { Authorization: `Bearer ${token}` } });
            setEnrollmentData({ courseId: '', userId: '', enrollmentRole: 'STUDENT' });
            fetchData();
            alert('Matrícula realizada com sucesso!');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro ao matricular');
            } else {
                alert('Erro ao matricular');
            }
        }
    };

    const handleEnrollAllStudents = async (courseId: string) => {
        try {
            const res = await api.post('/api/admin/enrollments/all', { courseId }, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
            alert(`${res.data.enrolled} aluno(s) matriculado(s) com sucesso!`);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro ao matricular');
            } else {
                alert('Erro ao matricular alunos');
            }
        }
    };

    const handleRemoveEnrollment = async (enrollmentId: string) => {
        try {
            await api.delete(`/api/admin/enrollments/${enrollmentId}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch { alert('Erro ao remover matrícula'); }
    };

    // Upload image for thumbnails or content
    const handleImageUpload = async (file: File): Promise<string | null> => {
        const formData = new FormData();
        formData.append('image', file);
        try {
            setUploadingImage(true);
            const res = await api.post('/api/admin/upload-image', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.url;
        } catch {
            alert('Erro ao fazer upload de imagem');
            return null;
        } finally {
            setUploadingImage(false);
        }
    };

    // Upload PDF for module material or course calendar
    const handlePdfUpload = async (file: File): Promise<string | null> => {
        const formData = new FormData();
        formData.append('pdf', file);
        try {
            const res = await api.post('/api/admin/upload-pdf', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.url;
        } catch {
            alert('Erro ao fazer upload do PDF');
            return null;
        }
    };

    const handleUploadModulePdf = async (moduleId: string, file: File) => {
        const url = await handlePdfUpload(file);
        if (url) {
            await api.put(`/api/admin/modules/${moduleId}`, { pdfUrl: url }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        }
    };

    const handleRemoveModulePdf = async (moduleId: string) => {
        await api.put(`/api/admin/modules/${moduleId}`, { pdfUrl: null }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        fetchData();
    };

    const handleUploadCalendar = async (courseId: string, file: File) => {
        const url = await handlePdfUpload(file);
        if (url) {
            await api.put(`/api/admin/courses/${courseId}`, { calendarUrl: url }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        }
    };

    const handleRemoveCalendar = async (courseId: string) => {
        await api.put(`/api/admin/courses/${courseId}`, { calendarUrl: null }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        fetchData();
    };

    // Edit video content
    const handleEditVideo = async (videoId: string) => {
        try {
            const contentToSave = editBlocks.length > 0 ? JSON.stringify(editBlocks) : editVideoData.content;
            await api.put(`/api/admin/videos/${videoId}`, { ...editVideoData, content: contentToSave }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEditingVideoId(null);
            setEditVideoData({ title: '', description: '', content: '' });
            setEditBlocks([]);
            fetchData();
            alert('Vídeo atualizado com sucesso!');
        } catch { alert('Erro ao atualizar vídeo'); }
    };

    // Open video for editing — parse content into blocks if possible
    const openVideoEditor = (v: { id: string; title: string; description: string | null; content: string | null }) => {
        setEditingVideoId(v.id);
        setEditVideoData({ title: v.title, description: v.description || '', content: v.content || '' });
        const parsed = parseContentField(v.content || null);
        setEditBlocks(parsed.isBlocks ? parsed.blocks : []);
        setEditorModalMode('edit');
    };

    // Excel student upload
    const handleExcelUpload = async (file: File) => {
        setExcelUploading(true);
        setExcelResults(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/api/admin/upload-students-excel', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setExcelResults(res.data.results);
            fetchData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro ao processar Excel');
            } else {
                alert('Erro ao processar Excel');
            }
        } finally {
            setExcelUploading(false);
        }
    };

    // Reprocess video with ERROR status
    const handleReprocessVideo = async (videoId: string) => {
        try {
            await api.post(`/api/admin/videos/${videoId}/reprocess`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            alert('Vídeo reenfileirado para processamento!');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.message || 'Erro ao reprocessar');
            } else {
                alert('Erro ao reprocessar vídeo');
            }
        }
    };

    // Unused variables removed

    const handleExportStudents = async () => {
        try {
            const res = await api.get('/api/admin/export-students', {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `alunos-${new Date().toISOString().split('T')[0]}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch { alert('Erro ao exportar.'); }
    };

    const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!notifForm.title || !notifForm.message) return;
        try {
            const res = await api.post('/api/admin/notifications', notifForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert(res.data.message);
            setNotifForm({ title: '', message: '' });
        } catch { alert('Erro ao enviar notificação.'); }
    };

    // ── Live Class handlers ──
    const handleCreateLive = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!liveForm.courseId || !liveForm.title || !liveForm.startAt || !liveForm.zoomJoinUrl) return;
        try {
            await api.post('/api/admin/live-classes', liveForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLiveForm({ courseId: '', moduleId: '', title: '', description: '', startAt: '', endAt: '', zoomJoinUrl: '', zoomStartUrl: '', zoomMeetingId: '' });
            fetchData();
        } catch { alert('Erro ao criar aula ao vivo.'); }
    };

    const handleUpdateLive = async (id: string) => {
        try {
            await api.put(`/api/admin/live-classes/${id}`, { status: editingLiveStatus }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEditingLiveId(null);
            setEditingLiveStatus('');
            fetchData();
        } catch { alert('Erro ao atualizar status.'); }
    };

    const handleDeleteLive = (id: string, title: string) => {
        setConfirmAction({
            message: `Remover aula ao vivo "${title}"?`,
            action: async () => {
                try {
                    await api.delete(`/api/admin/live-classes/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    fetchData();
                } catch { alert('Erro ao remover aula ao vivo.'); }
            }
        });
    };

    const handleReorderCourse = async (courseId: string, direction: 'up' | 'down') => {
        const sorted = [...courses].sort((a, b) => (a.order || 0) - (b.order || 0));
        const idx = sorted.findIndex(c => c.id === courseId);
        if ((direction === 'up' && idx <= 0) || (direction === 'down' && idx >= sorted.length - 1)) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        const orders = sorted.map((c, i) => {
            if (i === idx) return { id: c.id, order: swapIdx };
            if (i === swapIdx) return { id: c.id, order: idx };
            return { id: c.id, order: i };
        });
        try {
            await api.put('/api/admin/courses/reorder', { orders }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch { alert('Erro ao reordenar.'); }
    };

    const handleUpdateBranding = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setBrandingLoading(true);
            setBrandingMsg(null);

            const headers = {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            await api.put('/api/admin/config', brandingForm, { headers });

            setBrandingMsg({ type: 'success', text: 'Branding global atualizado! Recarregue a página para ver os efeitos.' });

            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (err: unknown) {
            if (axios.isAxiosError(err)) setBrandingMsg({ type: 'error', text: err.response?.data?.message || 'Erro' });
            else setBrandingMsg({ type: 'error', text: 'Erro desconhecido.' });
        } finally { setBrandingLoading(false); }
    };

    const handleUploadBrandLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setBrandingLoading(true);
        const formData = new FormData();
        formData.append('image', e.target.files[0]);
        try {
            const res = await api.post('/api/admin/upload-image', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBrandingForm({ ...brandingForm, logoUrl: res.data.url });
        } catch {
            alert('Erro ao fazer upload da logo.');
        } finally {
            setBrandingLoading(false);
        }
    };

    const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setBrandingLoading(true);
        const formData = new FormData();
        formData.append('image', e.target.files[0]);
        try {
            const res = await api.post('/api/admin/upload-image', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBrandingForm({ ...brandingForm, bannerUrl: res.data.url });
        } catch {
            alert('Erro ao fazer upload do banner.');
        } finally {
            setBrandingLoading(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsMsg(null);
        setSettingsLoading(true);

        if (settingsForm.newPassword && settingsForm.newPassword !== settingsForm.confirmPassword) {
            setSettingsMsg({ type: 'error', text: 'As senhas não coincidem.' });
            setSettingsLoading(false);
            return;
        }

        if (!settingsForm.currentPassword) {
            setSettingsMsg({ type: 'error', text: 'Informe a senha atual para confirmar alterações.' });
            setSettingsLoading(false);
            return;
        }

        try {
            const payload: Record<string, string> = {
                currentPassword: settingsForm.currentPassword,
            };
            if (settingsForm.newUsername && settingsForm.newUsername !== user?.username) {
                payload.newUsername = settingsForm.newUsername;
            }
            if (settingsForm.newPassword) {
                payload.newPassword = settingsForm.newPassword;
            }

            const res = await api.put('/api/auth/profile', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Atualizar token e user no contexto
            doLogin(res.data.token, res.data.user);

            setSettingsForm(prev => ({
                ...prev,
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            }));
            setSettingsMsg({ type: 'success', text: res.data.message || 'Credenciais atualizadas!' });
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setSettingsMsg({ type: 'error', text: err.response?.data?.message || 'Erro ao atualizar.' });
            } else {
                setSettingsMsg({ type: 'error', text: 'Erro desconhecido.' });
            }
        } finally {
            setSettingsLoading(false);
        }
    };

    // Attendance handlers
    const fetchAttendance = async () => {
        if (!attendanceFilter.moduleId || !attendanceFilter.date) return;
        try {
            const res = await api.get('/api/admin/attendance', {
                headers: { Authorization: `Bearer ${token}` },
                params: { moduleId: attendanceFilter.moduleId, date: attendanceFilter.date }
            });
            setAttendanceData(res.data);
        } catch { console.error('Erro ao buscar presenças'); }
    };

    const handleAttendanceEdit = async () => {
        if (!attendanceEditModal || !attendanceEditForm.justification.trim()) {
            alert('A justificativa é obrigatória.');
            return;
        }
        try {
            const headers = { Authorization: `Bearer ${token}` };
            if (attendanceEditModal.id) {
                await api.put(`/api/admin/attendance/${attendanceEditModal.id}`, {
                    status: attendanceEditForm.status,
                    justification: attendanceEditForm.justification
                }, { headers });
            } else {
                await api.post('/api/admin/attendance', {
                    userId: attendanceEditModal.userId,
                    moduleId: attendanceEditModal.moduleId,
                    date: attendanceEditModal.date,
                    status: attendanceEditForm.status,
                    justification: attendanceEditForm.justification
                }, { headers });
            }
            setAttendanceEditModal(null);
            setAttendanceEditForm({ status: '', justification: '' });
            fetchAttendance();
            alert('Presença atualizada com sucesso!');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) alert(err.response?.data?.message || 'Erro');
            else alert('Erro ao atualizar presença.');
        }
    };

    const handleSaveAttendanceConfig = async () => {
        try {
            await api.put('/api/admin/config', attendanceConfig, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Configurações de presença salvas!');
        } catch { alert('Erro ao salvar configurações de presença.'); }
    };

    const overviewEnrollments = useMemo(
        () => courses.reduce((total, course) => total + course.enrollments.filter(enrollment => enrollment.enrollmentRole === 'STUDENT').length, 0),
        [courses]
    );
    const overviewTeachers = useMemo(() => users.filter(item => item.role === 'TEACHER').length, [users]);
    const overviewModules = useMemo(() => courses.reduce((total, course) => total + course.modules.length, 0), [courses]);
    const overviewCourseRows = useMemo(() => {
        if (reports.length > 0) return reports.slice(0, 5);
        return courses.slice(0, 5).map(course => ({
            id: course.id,
            name: course.name,
            totalStudents: course.enrollments.filter(enrollment => enrollment.enrollmentRole === 'STUDENT').length,
            totalVideos: course.modules.reduce((total, module) => total + module.videos.length, 0),
            completionRate: 0,
            completedLessons: 0,
            totalPossibleLessons: 0
        }));
    }, [courses, reports]);
    const maxCourseStudents = Math.max(1, ...overviewCourseRows.map(course => course.totalStudents));
    const adminDate = useMemo(() => {
        const value = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
        return value.charAt(0).toUpperCase() + value.slice(1);
    }, []);

    const handleGlobalSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const query = globalSearch.trim();
        if (!query) return;
        setUserSearchInput(query);
        setUserSearch(query);
        setUserPage(1);
        setActiveTab('users');
    };

    return (
        <>
        <div className={`admin-root ${sidebarCollapsed ? 'admin-sidebar-collapsed' : ''}`}>
            <header className="admin-header admin-pro-header">
                <div className="admin-header-brand">
                    {config.logoUrl ? (
                        <img src={`${API_BASE}${config.logoUrl}`} alt={config.platformName} />
                    ) : <ShieldCheck size={31} aria-hidden="true" />}
                    <h2 className="admin-brand">
                        <span style={{ color: config.nameColor1 }}>{config.namePart1}</span>
                        <span style={{ color: config.nameColor2 }}>{config.namePart2}</span>
                        <em>{isTeacher ? 'Professor' : 'Admin'}</em>
                    </h2>
                    <button type="button" className="admin-menu-btn" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!sidebarCollapsed}><Menu size={20} /></button>
                </div>

                {!isTeacher && (
                    <form className="admin-global-search" onSubmit={handleGlobalSearch}>
                        <Search size={17} aria-hidden="true" />
                        <input value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} placeholder="Buscar alunos por nome ou e-mail..." aria-label="Busca global" />
                    </form>
                )}

                <div className="admin-header-right">
                    {!isTeacher && <button type="button" className="admin-header-icon" onClick={() => setActiveTab('notifications')} title="Notificações"><Bell size={18} /></button>}
                    <span className="admin-avatar">{user?.name?.charAt(0).toUpperCase()}</span>
                    <span className="admin-user-info"><strong>{user?.name}</strong><small>{roleLabel(user?.role || '')}</small></span>
                    <button onClick={logout} className="admin-logout-btn" title="Sair"><LogOut size={17} /><span>Sair</span></button>
                </div>
            </header>

            <div className="admin-layout">
                {/* Sidebar Tabs */}
                <aside className="admin-sidebar">
                    {!isTeacher && (
                    <button onClick={() => setActiveTab('overview')} className={`admin-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}>
                        <Activity size={20} /> Visão Geral
                    </button>
                    )}
                    <span className="admin-sidebar-section-label">Gestão acadêmica</span>
                    <button onClick={() => setActiveTab('courses')} className={`admin-nav-btn ${activeTab === 'courses' ? 'active' : ''}`}>
                        <BookOpen size={20} /> {isTeacher ? 'Meus Cursos' : 'Cursos e Conteúdos'}
                    </button>
                    <button onClick={() => window.location.assign('/school')} className="admin-nav-btn">
                        <School size={20} /> Escola 360
                    </button>
                    {!isTeacher && (
                    <>
                    <button onClick={() => setActiveTab('live')} className={`admin-nav-btn ${activeTab === 'live' ? 'active' : ''}`}>
                        <Video size={20} /> Aulas ao Vivo
                    </button>
                    <button onClick={() => setActiveTab('attendance')} className={`admin-nav-btn ${activeTab === 'attendance' ? 'active' : ''}`}>
                        <CheckCircle size={20} /> Presença
                    </button>
                    </>
                    )}

                    {!isTeacher && <span className="admin-sidebar-section-label">Usuários e acessos</span>}
                    {!isTeacher && (
                    <button onClick={() => setActiveTab('users')} className={`admin-nav-btn ${activeTab === 'users' ? 'active' : ''}`}>
                        <Users size={20} /> Usuários
                    </button>
                    )}
                    {!isTeacher && (
                    <>
                    <button onClick={() => setActiveTab('audit')} className={`admin-nav-btn ${activeTab === 'audit' ? 'active' : ''}`}>
                        <ClipboardList size={20} /> Logs do Sistema
                    </button>
                    <button onClick={() => setActiveTab('reports')} className={`admin-nav-btn ${activeTab === 'reports' ? 'active' : ''}`}>
                        <BarChart3 size={20} /> Relatórios de Acesso
                    </button>
                    <span className="admin-sidebar-section-label">Comunicação e segurança</span>
                    <button onClick={() => setActiveTab('notifications')} className={`admin-nav-btn ${activeTab === 'notifications' ? 'active' : ''}`}>
                        <Bell size={20} /> Notificações
                    </button>
                    <button onClick={() => setActiveTab('moderation')} className={`admin-nav-btn ${activeTab === 'moderation' ? 'active' : ''}`}>
                        <ShieldCheck size={20} /> Moderação
                        {flaggedTotal > 0 && <span className="admin-nav-badge">{flaggedTotal}</span>}
                    </button>
                    <button onClick={() => setActiveTab('punishment')} className={`admin-nav-btn ${activeTab === 'punishment' ? 'active' : ''}`}>
                        <Ban size={20} /> Punições
                    </button>
                    <span className="admin-sidebar-section-label">Experiências</span>
                    <button onClick={() => setActiveTab('broadcast')} className={`admin-nav-btn ${activeTab === 'broadcast' ? 'active' : ''}`}>
                        <RadioTower size={20} /> Campus ao Vivo
                    </button>
                    </>
                    )}

                    <button onClick={() => setActiveTab('privaterooms')} className={`admin-nav-btn ${activeTab === 'privaterooms' ? 'active' : ''}`}>
                        <Key size={20} /> Salas Privadas
                    </button>

                    <span className="admin-sidebar-section-label">Configurações</span>
                    <button onClick={() => setActiveTab('settings')} className={`admin-nav-btn ${activeTab === 'settings' ? 'active' : ''}`}>
                        <Settings size={20} /> Configurações
                    </button>
                </aside>

                {/* Main Content Area */}
                <main className="admin-main">

                    {/* TAB: OVERVIEW */}
                    {activeTab === 'overview' && stats && (
                        <div className="admin-fade-in admin-overview">
                            <section className="admin-overview-welcome">
                                <div><span>Painel executivo</span><h1>Olá, {user?.name?.split(' ')[0] || 'Administrador'}! <span aria-hidden="true">👋</span></h1><p>Aqui está o resumo operacional da plataforma {config.platformName}.</p></div>
                                <time><CalendarDays size={17} /> {adminDate}</time>
                            </section>

                            <section className="admin-overview-kpis" aria-label="Indicadores da plataforma">
                                <article><span className="violet"><Users /></span><div><small>Total de alunos</small><strong>{stats.totalUsers.toLocaleString('pt-BR')}</strong><p>contas estudantis</p></div></article>
                                <article><span className="blue"><BookOpen /></span><div><small>Cursos ativos</small><strong>{stats.totalCourses.toLocaleString('pt-BR')}</strong><p>catálogo publicado</p></div></article>
                                <article><span className="green"><FileVideo /></span><div><small>Aulas publicadas</small><strong>{stats.readyVideos.toLocaleString('pt-BR')}</strong><p>de {stats.totalVideos} vídeos</p></div></article>
                                <article><span className="amber"><UserCheck /></span><div><small>Matrículas</small><strong>{overviewEnrollments.toLocaleString('pt-BR')}</strong><p>vínculos ativos</p></div></article>
                                <article><span className="violet"><Layers3 /></span><div><small>Módulos</small><strong>{overviewModules.toLocaleString('pt-BR')}</strong><p>trilhas organizadas</p></div></article>
                                <article><span className="blue"><Video /></span><div><small>Aulas ao vivo</small><strong>{liveClasses.length.toLocaleString('pt-BR')}</strong><p>encontros cadastrados</p></div></article>
                            </section>

                            <div className="admin-overview-primary-grid">
                                <section className="admin-overview-panel admin-course-chart">
                                    <header><div><span>Aprendizagem</span><h2>Alunos por curso</h2></div><button type="button" onClick={() => setActiveTab('reports')}>Ver relatório <ChevronDown size={14} /></button></header>
                                    <div className="admin-course-bars">
                                        {overviewCourseRows.length === 0 ? <p className="admin-overview-empty">Ainda não há cursos com matrículas.</p> : overviewCourseRows.map((course, index) => (
                                            <div key={course.id}><span>{course.name}</span><div><i style={{ width: `${Math.max(6, (course.totalStudents / maxCourseStudents) * 100)}%`, '--bar-index': index } as React.CSSProperties} /></div><strong>{course.totalStudents}</strong></div>
                                        ))}
                                    </div>
                                </section>

                                <section className="admin-overview-panel admin-live-activity">
                                    <header><div><span>Auditoria</span><h2>Atividade em tempo real</h2></div><em><i /> Online agora</em></header>
                                    <div>
                                        {auditLogs.length === 0 ? <p className="admin-overview-empty">Nenhuma ação recente registrada.</p> : auditLogs.slice(0, 5).map(log => (
                                            <article key={log.id}><span><ActivityIcon size={16} /></span><div><small>{auditActionLabel(log.action)}</small><strong>{log.user?.name || 'Sistema'}</strong><p>{log.target || log.details || 'Ação auditada'}</p></div><time>{new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></article>
                                        ))}
                                    </div>
                                    <button type="button" className="admin-panel-link" onClick={() => setActiveTab('audit')}>Ver todas as atividades <ChevronDown size={14} /></button>
                                </section>
                            </div>

                            <div className="admin-overview-secondary-grid">
                                <section className="admin-overview-panel admin-course-table-panel">
                                    <header><div><span>Conteúdo</span><h2>Cursos com maior alcance</h2></div><Library size={19} /></header>
                                    <div className="admin-overview-table-wrap"><table><thead><tr><th>Curso</th><th>Alunos</th><th>Aulas</th><th>Conclusão</th></tr></thead><tbody>{overviewCourseRows.map(course => <tr key={course.id}><td>{course.name}</td><td>{course.totalStudents}</td><td>{course.totalVideos}</td><td><span>{course.completionRate}%</span></td></tr>)}</tbody></table></div>
                                    <button type="button" className="admin-panel-link" onClick={() => setActiveTab('courses')}>Ver todos os cursos <ChevronDown size={14} /></button>
                                </section>

                                <section className="admin-overview-panel admin-health-panel">
                                    <header><div><span>Infraestrutura</span><h2>Saúde da plataforma</h2></div><Server size={19} /></header>
                                    <div className="admin-health-list">
                                        <article><span><Database /></span><div><strong>Banco de dados</strong><small>Persistência principal</small></div><em className={healthData?.services.database === 'up' ? 'ok' : 'error'}>{healthData?.services.database === 'up' ? 'Operacional' : 'Indisponível'}</em></article>
                                        <article><span><FileVideo /></span><div><strong>Armazenamento</strong><small>Vídeos e documentos</small></div><em className={healthData?.services.storage === 'up' ? 'ok' : 'error'}>{healthData?.services.storage === 'up' ? 'Operacional' : 'Indisponível'}</em></article>
                                        <article><span><Clock3 /></span><div><strong>Tempo online</strong><small>Processo da aplicação</small></div><em>{healthData ? `${Math.floor(healthData.uptime / 3600)}h` : '—'}</em></article>
                                    </div>
                                    <button type="button" className="admin-panel-link" onClick={() => setActiveTab('audit')}>Abrir observabilidade <ChevronDown size={14} /></button>
                                </section>

                                <section className="admin-overview-panel admin-pending-panel">
                                    <header><div><span>Operação</span><h2>Pendências</h2></div><AlertTriangle size={19} /></header>
                                    <div>
                                        <button type="button" onClick={() => setActiveTab('courses')}><Upload /><span>Vídeos processando</span><strong>{stats.processingVideos}</strong></button>
                                        <button type="button" onClick={() => setActiveTab('courses')}><Clock3 /><span>Vídeos pendentes</span><strong>{stats.pendingVideos}</strong></button>
                                        <button type="button" onClick={() => setActiveTab('courses')}><AlertCircle /><span>Falhas de mídia</span><strong className="danger">{stats.errorVideos}</strong></button>
                                        <button type="button" onClick={() => setActiveTab('moderation')}><MessageCircle /><span>Itens em moderação</span><strong>{flaggedTotal}</strong></button>
                                    </div>
                                </section>
                            </div>

                            <section className="admin-quick-summary">
                                <h2>Resumo rápido</h2><div>
                                    <article><Users /><span><small>Usuários cadastrados</small><strong>{userTotal.toLocaleString('pt-BR')}</strong></span></article>
                                    <article><UserCog /><span><small>Professores</small><strong>{overviewTeachers}</strong></span></article>
                                    <article><FileVideo /><span><small>Conteúdos</small><strong>{stats.totalVideos}</strong></span></article>
                                    <article><ActivityIcon /><span><small>Eventos recentes</small><strong>{auditLogs.length}</strong></span></article>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* TAB: USERS */}
                    {activeTab === 'users' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Gerenciar Alunos</h2>

                            <div className="admin-card">
                                <h3>Cadastrar Novo Acesso</h3>
                                <form onSubmit={handleCreateUser} className="admin-form-row">
                                    <input placeholder="Nome" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required className="admin-input" />
                                    <input type="email" placeholder="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required className="admin-input" />
                                    <input type="password" placeholder="Senha" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required className="admin-input" />
                                    <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="admin-input">
                                        <option value="STUDENT">Aluno</option>
                                        <option value="TEACHER">Professor</option>
                                        <option value="ADMIN">Admin</option>
                                        <option value="STAFF">Equipe escolar</option>
                                        <option value="GUARDIAN">Responsável</option>
                                    </select>
                                    <button type="submit" className="admin-btn-primary">
                                        <Plus size={16} /> Salvar
                                    </button>
                                </form>
                            </div>

                            {/* Excel Upload Card */}
                            <div className="admin-card">
                                <h3><FileSpreadsheet size={18} /> Importar Alunos via Excel</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                    Cabeçários esperados: <strong>aluno</strong>, <strong>matricula</strong>, <strong>turma</strong>, <strong>cpf</strong>. O sistema gera email e senha automaticamente e matricula nas turmas correspondentes.
                                </p>
                                <div className="admin-form-row">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={e => {
                                            if (e.target.files && e.target.files[0]) {
                                                handleExcelUpload(e.target.files[0]);
                                                e.target.value = '';
                                            }
                                        }}
                                        disabled={excelUploading}
                                        style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1 }}
                                    />
                                    {excelUploading && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Processando...</span>}
                                </div>
                                {excelResults && (
                                    <div className="excel-results">
                                        <h4>Resultado da Importação ({excelResults.length} alunos)</h4>
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>Nome</th>
                                                    <th>Email</th>
                                                    <th>Senha</th>
                                                    <th>Matriculado em</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {excelResults.map((r, i) => (
                                                    <tr key={i}>
                                                        <td>{r.name}</td>
                                                        <td>{r.email}</td>
                                                        <td><code>{r.password}</code></td>
                                                        <td>{r.enrolled.length > 0 ? r.enrolled.join(', ') : '—'}</td>
                                                        <td>
                                                            {r.error ? (
                                                                <span className="admin-status-badge error">{r.error}</span>
                                                            ) : (
                                                                <span className="admin-status-badge ready">OK</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="admin-search-bar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar por nome ou email..."
                                    value={userSearchInput}
                                    onChange={e => setUserSearchInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') setUserSearch(userSearchInput); }}
                                    className="admin-input"
                                    style={{ flex: 1 }}
                                />
                                <button onClick={() => setUserSearch(userSearchInput)} className="admin-btn primary" style={{ whiteSpace: 'nowrap' }}>
                                    Buscar
                                </button>
                                {userSearch && (
                                    <button onClick={() => { setUserSearchInput(''); setUserSearch(''); }} className="admin-btn" style={{ whiteSpace: 'nowrap' }}>
                                        Limpar
                                    </button>
                                )}
                                <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {userTotal} usuário(s)
                                </span>
                            </div>

                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Email</th>
                                        <th>Permissão</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td>
                                                {editingUserId === u.id ? (
                                                    <input value={editUserData.name} onChange={e => setEditUserData({ ...editUserData, name: e.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }} />
                                                ) : u.name}
                                            </td>
                                            <td>
                                                {editingUserId === u.id ? (
                                                    <input type="email" value={editUserData.email} onChange={e => setEditUserData({ ...editUserData, email: e.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }} />
                                                ) : u.email}
                                            </td>
                                            <td>
                                                {editingUserId === u.id ? (
                                                    <select value={editUserData.role} onChange={e => setEditUserData({ ...editUserData, role: e.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }}>
                                                        <option value="STUDENT">Aluno</option>
                                                        <option value="TEACHER">Professor</option>
                                                        <option value="ADMIN">Admin</option>
                                                        <option value="STAFF">Equipe escolar</option>
                                                        <option value="GUARDIAN">Responsável</option>
                                                    </select>
                                                ) : <span className={`admin-role-badge ${u.role.toLowerCase()}`}>{roleLabel(u.role)}</span>}
                                            </td>
                                            <td style={{ display: 'flex', gap: '0.5rem' }}>
                                                {editingUserId === u.id ? (
                                                    <>
                                                        <button onClick={async () => {
                                                            try {
                                                                const payload: Record<string, string> = {};
                                                                if (editUserData.name !== u.name) payload.name = editUserData.name;
                                                                if (editUserData.email !== u.email) payload.email = editUserData.email;
                                                                if (editUserData.role !== u.role) payload.role = editUserData.role;
                                                                if (editUserData.password) payload.password = editUserData.password;
                                                                if (Object.keys(payload).length > 0) {
                                                                    await api.put(`/api/admin/users/${u.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
                                                                    fetchData();
                                                                }
                                                                setEditingUserId(null);
                                                            } catch (error: unknown) {
                                                                alert(axios.isAxiosError<{ message?: string }>(error)
                                                                    ? error.response?.data?.message || 'Erro ao atualizar usuário.'
                                                                    : 'Erro ao atualizar usuário.');
                                                            }
                                                        }} className="admin-btn-icon" style={{ color: '#22c55e' }} title="Salvar">
                                                            <Save size={18} />
                                                        </button>
                                                        <button onClick={() => setEditingUserId(null)} className="admin-btn-icon" title="Cancelar">
                                                            <X size={18} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingUserId(u.id); setEditUserData({ name: u.name, email: u.email, role: u.role, password: '' }); }} className="admin-btn-icon" title="Editar">
                                                            <Edit3 size={18} />
                                                        </button>
                                                        <button onClick={() => setConfirmAction({ message: `Remover "${u.name}"?`, action: () => handleDeleteUser(u.id) })} className="admin-btn-icon danger">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Paginação */}
                            {userTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={() => setUserPage(p => Math.max(1, p - 1))}
                                        disabled={userPage <= 1}
                                        className="admin-btn"
                                        style={{ padding: '0.4rem 1rem' }}
                                    >
                                        ← Anterior
                                    </button>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        Página {userPage} de {userTotalPages}
                                    </span>
                                    <button
                                        onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))}
                                        disabled={userPage >= userTotalPages}
                                        className="admin-btn"
                                        style={{ padding: '0.4rem 1rem' }}
                                    >
                                        Próxima →
                                    </button>
                                </div>
                            )}

                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={handleExportStudents} className="admin-btn-primary" style={{ gap: '0.5rem' }}>
                                    <Download size={16} /> Exportar Alunos (Excel)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: COURSES */}
                    {activeTab === 'courses' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">{isTeacher ? 'Meus Cursos' : 'Gerenciar Cursos'}</h2>

                            {!isTeacher && (
                            <div className="admin-card">
                                <h3>Criar Novo Curso</h3>
                                <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                    <div className="admin-form-row">
                                        <input placeholder="Nome do Curso (Ex: Módulo Intensivo OAB)" value={newCourse.name} onChange={e => setNewCourse({ ...newCourse, name: e.target.value })} required className="admin-input" style={{ flex: 2 }} />
                                        <input placeholder="Descrição" value={newCourse.description} onChange={e => setNewCourse({ ...newCourse, description: e.target.value })} className="admin-input" style={{ flex: 2 }} />
                                    </div>
                                    <div className="admin-form-row" style={{ alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            <Upload size={16} /> Thumbnail:
                                        </label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={async (e) => {
                                                if (e.target.files?.[0]) {
                                                    const url = await handleImageUpload(e.target.files[0]);
                                                    if (url) setNewCourse(prev => ({ ...prev, thumbnailUrl: url }));
                                                }
                                            }}
                                            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }}
                                        />
                                        {newCourse.thumbnailUrl && (
                                            <img src={`${API_BASE}${newCourse.thumbnailUrl}`} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                                        )}
                                        <button type="submit" disabled={uploadingImage} className="admin-btn-primary">
                                            <Plus size={16} /> Salvar
                                        </button>
                                    </div>
                                </form>
                            </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {courses.map(c => (
                                    <div key={c.id} className="admin-course-card">

                                        {/* Course Header */}
                                        <div className="admin-course-header">
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                {!isTeacher && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    <button onClick={() => handleReorderCourse(c.id, 'up')} className="admin-btn-icon" title="Mover para cima" style={{ padding: '0.2rem' }}>
                                                        <ChevronUp size={16} />
                                                    </button>
                                                    <button onClick={() => handleReorderCourse(c.id, 'down')} className="admin-btn-icon" title="Mover para baixo" style={{ padding: '0.2rem' }}>
                                                        <ChevronDown size={16} />
                                                    </button>
                                                </div>
                                                )}
                                                {c.thumbnailUrl && (
                                                    <img src={`${API_BASE}${c.thumbnailUrl}`} alt={c.name} className="admin-course-thumb" />
                                                )}
                                                <div>
                                                    <h3 className="admin-course-name">{c.name}</h3>
                                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{c.description}</p>
                                                </div>
                                            </div>
                                            {!isTeacher && (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <label className="admin-btn-calendar" title="Upload Calendário PDF">
                                                    <CalendarDays size={16} />
                                                    {c.calendarUrl ? 'Trocar Calendário' : 'Calendário PDF'}
                                                    <input
                                                        type="file"
                                                        accept="application/pdf"
                                                        style={{ display: 'none' }}
                                                        onChange={e => {
                                                            if (e.target.files?.[0]) handleUploadCalendar(c.id, e.target.files[0]);
                                                        }}
                                                    />
                                                </label>
                                                {c.calendarUrl && (
                                                    <>
                                                        <a href={`${API_BASE}${c.calendarUrl}`} target="_blank" rel="noopener noreferrer" className="admin-btn-icon primary" title="Ver Calendário">
                                                            <Eye size={16} />
                                                        </a>
                                                        <button onClick={() => handleRemoveCalendar(c.id)} className="admin-btn-icon danger" title="Remover Calendário">
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                )}
                                                <button onClick={() => setConfirmAction({ message: `Deletar curso "${c.name}"? Todos os módulos e vídeos serão removidos.`, action: () => handleDeleteCourse(c.id) })} className="admin-btn-danger">
                                                    <Trash2 size={18} /> Deletar Curso
                                                </button>
                                            </div>
                                            )}
                                        </div>

                                        <div className={isTeacher ? '' : 'admin-course-grid'}>

                                            {/* Left Column: Modules & Videos */}
                                            <div>
                                                <h4 className="admin-section-label">Grade Curricular (Módulos e Aulas)</h4>

                                                {/* Add Module Form */}
                                                <form onSubmit={handleCreateModule} className="admin-form-row" style={{ marginBottom: '1.5rem' }}>
                                                    <input
                                                        placeholder="Nome do Novo Módulo"
                                                        required
                                                        value={newModule.courseId === c.id ? newModule.name : ''}
                                                        onChange={e => setNewModule({ courseId: c.id, name: e.target.value })}
                                                        className="admin-input"
                                                    />
                                                    <button type="submit" disabled={!newModule.name || newModule.courseId !== c.id} className="admin-btn-success">
                                                        <Plus size={16} /> Módulo
                                                    </button>
                                                </form>

                                                {/* Modules List */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    {c.modules.map(m => (
                                                        <div key={m.id} className="admin-module-block">

                                                            <div className="admin-module-header">
                                                                <strong className="admin-module-name">{m.name}</strong>
                                                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                                    <label className="admin-btn-icon primary" title="Upload Material PDF" style={{ cursor: 'pointer' }}>
                                                                        <FileDown size={16} />
                                                                        <input
                                                                            type="file"
                                                                            accept="application/pdf"
                                                                            style={{ display: 'none' }}
                                                                            onChange={e => {
                                                                                if (e.target.files?.[0]) handleUploadModulePdf(m.id, e.target.files[0]);
                                                                            }}
                                                                        />
                                                                    </label>
                                                                    {m.pdfUrl && (
                                                                        <>
                                                                            <a href={`${API_BASE}${m.pdfUrl}`} target="_blank" rel="noopener noreferrer" className="admin-pdf-badge" title="PDF anexado — clique para ver">
                                                                                📄 PDF
                                                                            </a>
                                                                            <button onClick={() => handleRemoveModulePdf(m.id)} className="admin-btn-icon danger" title="Remover PDF">
                                                                                <X size={14} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    <button onClick={() => setConfirmAction({ message: `Deletar módulo "${m.name}"? Vídeos serão removidos.`, action: () => handleDeleteModule(m.id) })} className="admin-btn-icon danger">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div style={{ padding: '1rem' }}>
                                                                {/* Videos List */}
                                                                {m.videos && m.videos.length > 0 ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                                                        {m.videos.map(v => (
                                                                            <div key={v.id} className="admin-video-item">
                                                                                <div className="admin-video-row">
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                                                                        <span style={{ color: 'var(--text-muted)' }}>Aula {v.order + 1}</span>
                                                                                        <span className="admin-video-title">{v.title}</span>
                                                                                        {v.status === 'READY' ? (
                                                                                            <span className="admin-status-badge ready">PRONTO</span>
                                                                                        ) : v.status === 'PROCESSING' ? (
                                                                                            <span className="admin-status-badge processing">PROCESSANDO</span>
                                                                                        ) : v.status === 'PENDING' ? (
                                                                                            <span className="admin-status-badge processing">PENDENTE</span>
                                                                                        ) : (
                                                                                            <span className="admin-status-badge error">ERRO</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                                        <button onClick={() => openVideoEditor(v)} className="admin-btn-icon primary">
                                                                                            <Edit3 size={14} />
                                                                                        </button>
                                                                                        {!isTeacher && (v.status === 'ERROR' || v.status === 'PENDING') && (
                                                                                            <button onClick={() => setConfirmAction({ message: `Reprocessar este vídeo?`, action: () => handleReprocessVideo(v.id) })} className="admin-btn-icon primary" title="Reprocessar">
                                                                                                <RefreshCw size={14} />
                                                                                            </button>
                                                                                        )}
                                                                                        {!isTeacher && (
                                                                                        <button onClick={() => setConfirmAction({ message: `Deletar vídeo "${v.title}"?`, action: () => handleDeleteVideo(v.id) })} className="admin-btn-icon danger">
                                                                                            <Trash2 size={14} />
                                                                                        </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {editingVideoId === v.id && (
                                                                                    <div className="admin-edit-inline-badge">
                                                                                        <Edit3 size={12} /> Editando — modal aberto
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', fontStyle: 'italic' }}>Nenhuma aula neste módulo.</p>
                                                                )}

                                                                {/* Upload Video Form */}
                                                                <form onSubmit={handleUploadVideo} className="admin-upload-zone">
                                                                    <span className="admin-upload-label">Adicionar Nova Aula</span>
                                                                    <input
                                                                        placeholder="Título do Vídeo"
                                                                        required
                                                                        value={uploadData.moduleId === m.id ? uploadData.title : ''}
                                                                        onChange={e => setUploadData({ ...uploadData, moduleId: m.id, title: e.target.value })}
                                                                        className="admin-input-sm"
                                                                    />
                                                                    <div className="admin-form-row">
                                                                        <input
                                                                            type="file"
                                                                            accept="video/mp4,video/mkv"
                                                                            required
                                                                            onChange={e => {
                                                                                if (e.target.files && e.target.files.length > 0) {
                                                                                    setUploadData(prev => ({ ...prev, moduleId: m.id, file: e.target.files![0] }));
                                                                                }
                                                                            }}
                                                                            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }}
                                                                        />
                                                                        <button
                                                                            type="submit"
                                                                            disabled={uploading || uploadData.moduleId !== m.id}
                                                                            className="admin-btn-primary-sm"
                                                                        >
                                                                            {uploading && uploadData.moduleId === m.id ? 'Enviando...' : 'Upload MP4'}
                                                                        </button>
                                                                    </div>
                                                                    {uploading && uploadData.moduleId === m.id && uploadProgress > 0 && (
                                                                        <div className="upload-progress-bar">
                                                                            <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                                                                            <span className="upload-progress-text">{uploadProgress}%</span>
                                                                        </div>
                                                                    )}
                                                                </form>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {c.modules.length === 0 && (
                                                        <div className="admin-empty-box">
                                                            Nenhum módulo criado. Crie um módulo primeiro para adicionar aulas.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Column: Enrollments */}
                                            {!isTeacher && (
                                            <div>
                                                <h4 className="admin-section-label">Alunos Matriculados</h4>

                                                {/* Enroll Student Form */}
                                                <form onSubmit={(e) => handleEnrollStudent(e, c.id)} className="admin-form-row" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    <select
                                                        required
                                                        value={enrollmentData.courseId === c.id ? enrollmentData.userId : ''}
                                                        onChange={e => setEnrollmentData(prev => ({ ...prev, courseId: c.id, userId: e.target.value }))}
                                                        className="admin-select"
                                                        style={{ flex: 2 }}
                                                    >
                                                        <option value="">Selecione um usuário...</option>
                                                        {users.filter(u => u.role === 'STUDENT' || u.role === 'TEACHER').map(u => (
                                                            <option key={u.id} value={u.id}>{u.name} ({u.email}) — {u.role === 'TEACHER' ? 'Professor' : 'Aluno'}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={enrollmentData.courseId === c.id ? (enrollmentData.enrollmentRole || 'STUDENT') : 'STUDENT'}
                                                        onChange={e => setEnrollmentData(prev => ({ ...prev, courseId: c.id, enrollmentRole: e.target.value }))}
                                                        className="admin-select"
                                                        style={{ flex: 1 }}
                                                    >
                                                        <option value="STUDENT">Aluno</option>
                                                        <option value="TEACHER">Professor</option>
                                                    </select>
                                                    <button type="submit" disabled={!enrollmentData.userId || enrollmentData.courseId !== c.id} className="admin-btn-primary">
                                                        Matricular
                                                    </button>
                                                </form>
                                                <button onClick={() => setConfirmAction({ message: 'Matricular TODOS os alunos neste curso?', action: () => handleEnrollAllStudents(c.id) })} className="admin-btn-primary" style={{ marginBottom: '1.5rem', background: 'var(--accent, #ec4899)', width: '100%' }}>
                                                    <Users size={14} /> Matricular Todos os Alunos
                                                </button>

                                                {/* Enrollments List */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {c.enrollments && c.enrollments.length > 0 ? (
                                                        c.enrollments.map((e) => (
                                                            <div key={e.id} className="admin-enrollment-item">
                                                                <div>
                                                                    <strong style={{ fontSize: '0.95rem' }}>{e.user.name}</strong>
                                                                    <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: e.enrollmentRole === 'TEACHER' ? 'var(--accent, #8b5cf6)' : 'var(--primary, #3b82f6)', color: '#fff', marginLeft: '0.4rem' }}>
                                                                        {e.enrollmentRole === 'TEACHER' ? 'Professor' : 'Aluno'}
                                                                    </span>
                                                                    <span className="admin-enrollment-email">{e.user.email}</span>
                                                                </div>
                                                                <button onClick={() => setConfirmAction({ message: `Remover matrícula de ${e.user.name}?`, action: () => handleRemoveEnrollment(e.id) })} className="admin-btn-icon danger" title="Remover Matrícula">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="admin-empty-box">
                                                            Nenhum aluno matriculado neste curso.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB: AUDIT LOG */}
                    {activeTab === 'audit' && (
                        <div className="admin-fade-in">
                            {healthData && (
                                <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                                        <div className="stat-icon"><ActivityIcon size={24} /></div>
                                        <div className="stat-info">
                                            <h3>Uptime do Servidor</h3>
                                            <div className="stat-value">{Math.floor(healthData.uptime / 3600)}h {Math.floor((healthData.uptime % 3600) / 60)}m</div>
                                        </div>
                                    </div>
                                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                                        <div className="stat-icon"><Monitor size={24} /></div>
                                        <div className="stat-info">
                                            <h3>Uso de Memória</h3>
                                            <div className="stat-value">{Math.round(healthData.memory.process / 1024 / 1024)} MB</div>
                                        </div>
                                    </div>
                                    <div className="stat-card" style={{ flex: 1, minWidth: '200px' }}>
                                        <div className="stat-icon"><Settings size={24} /></div>
                                        <div className="stat-info">
                                            <h3>Status dos Serviços</h3>
                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthData.services.database === 'up' ? '#10b981' : '#ef4444' }}></span>
                                                    DB
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthData.services.storage === 'up' ? '#10b981' : '#ef4444' }}></span>
                                                    Storage
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <h2 className="admin-page-title">Audit Log</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Registro de todas as ações administrativas na plataforma.</p>

                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Usuário</th>
                                        <th>Ação</th>
                                        <th>Alvo</th>
                                        <th>Detalhes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map(log => (
                                        <tr key={log.id}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                                            <td>{log.user?.name || '—'}</td>
                                            <td><span className="admin-status-badge ready">{log.action}</span></td>
                                            <td style={{ fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.target || '—'}</td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.details || '—'}</td>
                                        </tr>
                                    ))}
                                    {auditLogs.length === 0 && (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>
                                    )}
                                </tbody>
                            </table>

                            {auditTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage <= 1} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>
                                        ← Anterior
                                    </button>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        Página {auditPage} de {auditTotalPages}
                                    </span>
                                    <button onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))} disabled={auditPage >= auditTotalPages} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>
                                        Próxima →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: REPORTS */}
                    {activeTab === 'reports' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Relatórios dos Cursos</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Visão geral de progresso e conclusão por curso.</p>

                            <div className="admin-stats-grid" style={{ gap: '1.5rem' }}>
                                {reports.map(r => (
                                    <div key={r.id} className="admin-stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
                                        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{r.name}</h3>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.totalStudents} alunos</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.totalVideos} aulas</span>
                                        </div>
                                        <div className="report-progress-bar">
                                            <div className="report-progress-fill" style={{ width: `${r.completionRate}%` }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.completionRate}% conclusão</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.completedLessons}/{r.totalPossibleLessons} aulas</span>
                                        </div>
                                    </div>
                                ))}
                                {reports.length === 0 && (
                                    <div className="admin-empty-box">Nenhum curso encontrado.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: NOTIFICATIONS */}
                    {activeTab === 'notifications' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Enviar Notificação</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Envie uma notificação para todos os alunos da plataforma.</p>

                            <div className="admin-card">
                                <form onSubmit={handleSendNotification} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <input
                                        placeholder="Título da notificação"
                                        value={notifForm.title}
                                        onChange={e => setNotifForm({ ...notifForm, title: e.target.value })}
                                        required
                                        className="admin-input"
                                    />
                                    <textarea
                                        placeholder="Mensagem..."
                                        value={notifForm.message}
                                        onChange={e => setNotifForm({ ...notifForm, message: e.target.value })}
                                        required
                                        className="admin-input"
                                        style={{ minHeight: '100px', resize: 'vertical' }}
                                    />
                                    <button type="submit" className="admin-btn-primary" style={{ alignSelf: 'flex-start' }}>
                                        <Bell size={16} /> Enviar para todos os alunos
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* TAB: LIVE CLASSES */}
                    {activeTab === 'live' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Aulas ao Vivo (Zoom)</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                                Agende aulas ao vivo e compartilhe o link do Zoom com os alunos matriculados.
                            </p>

                            {/* Form: Nova Aula ao Vivo */}
                            <div className="admin-card" style={{ marginBottom: '2rem' }}>
                                <h3>Agendar Nova Aula ao Vivo</h3>
                                <form onSubmit={handleCreateLive} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <select
                                            value={liveForm.courseId}
                                            onChange={e => setLiveForm({ ...liveForm, courseId: e.target.value, moduleId: '' })}
                                            required
                                            className="admin-input"
                                        >
                                            <option value="">Selecionar Curso *</option>
                                            {courses.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={liveForm.moduleId}
                                            onChange={e => setLiveForm({ ...liveForm, moduleId: e.target.value })}
                                            className="admin-input"
                                        >
                                            <option value="">Módulo (opcional)</option>
                                            {liveForm.courseId && courses.find(c => c.id === liveForm.courseId)?.modules.map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <input
                                        placeholder="Título da aula *"
                                        value={liveForm.title}
                                        onChange={e => setLiveForm({ ...liveForm, title: e.target.value })}
                                        required
                                        className="admin-input"
                                    />
                                    <input
                                        placeholder="Descrição (opcional)"
                                        value={liveForm.description}
                                        onChange={e => setLiveForm({ ...liveForm, description: e.target.value })}
                                        className="admin-input"
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Data/Hora Início *</label>
                                            <input
                                                type="datetime-local"
                                                value={liveForm.startAt}
                                                onChange={e => setLiveForm({ ...liveForm, startAt: e.target.value })}
                                                required
                                                className="admin-input"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Data/Hora Fim (opcional)</label>
                                            <input
                                                type="datetime-local"
                                                value={liveForm.endAt}
                                                onChange={e => setLiveForm({ ...liveForm, endAt: e.target.value })}
                                                className="admin-input"
                                            />
                                        </div>
                                    </div>
                                    <input
                                        placeholder="Link do Zoom (Join URL) *"
                                        value={liveForm.zoomJoinUrl}
                                        onChange={e => setLiveForm({ ...liveForm, zoomJoinUrl: e.target.value })}
                                        required
                                        className="admin-input"
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <input
                                            placeholder="Link do Host (Start URL, opcional)"
                                            value={liveForm.zoomStartUrl}
                                            onChange={e => setLiveForm({ ...liveForm, zoomStartUrl: e.target.value })}
                                            className="admin-input"
                                        />
                                        <input
                                            placeholder="Meeting ID (opcional)"
                                            value={liveForm.zoomMeetingId}
                                            onChange={e => setLiveForm({ ...liveForm, zoomMeetingId: e.target.value })}
                                            className="admin-input"
                                        />
                                    </div>
                                    <button type="submit" className="admin-btn-primary" style={{ alignSelf: 'flex-start' }}>
                                        <Plus size={16} /> Agendar Aula ao Vivo
                                    </button>
                                </form>
                            </div>

                            {/* List: Aulas Agendadas */}
                            <div className="admin-card">
                                <h3>Aulas Agendadas</h3>
                                {liveClasses.length === 0 ? (
                                    <div className="admin-empty-box">Nenhuma aula ao vivo agendada.</div>
                                ) : (
                                    <div className="live-class-list">
                                        {liveClasses.map((lc) => (
                                            <div key={lc.id} className={`live-class-item status-${lc.status.toLowerCase()}`}>
                                                <div className="live-class-info">
                                                    <div className="live-class-header">
                                                        <strong>{lc.title}</strong>
                                                        <span className={`live-status-badge ${lc.status.toLowerCase()}`}>
                                                            {lc.status === 'SCHEDULED' ? '📅 Agendada' : lc.status === 'LIVE' ? '🔴 Ao Vivo' : lc.status === 'ENDED' ? '✅ Encerrada' : '🎬 Gravada'}
                                                        </span>
                                                    </div>
                                                    <div className="live-class-meta">
                                                        <span>📚 {lc.course?.name}</span>
                                                        {lc.module && <span>📁 {lc.module.name}</span>}
                                                        <span>🕐 {new Date(lc.startAt).toLocaleString('pt-BR')}</span>
                                                        {lc.endAt && <span>→ {new Date(lc.endAt).toLocaleString('pt-BR')}</span>}
                                                    </div>
                                                    {lc.zoomJoinUrl && (
                                                        <a href={lc.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="live-zoom-link">
                                                            <ExternalLink size={14} /> Link do Zoom
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="live-class-actions">
                                                    {editingLiveId === lc.id ? (
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <select
                                                                value={editingLiveStatus}
                                                                onChange={e => setEditingLiveStatus(e.target.value)}
                                                                className="admin-input"
                                                                style={{ width: 'auto', minWidth: '140px' }}
                                                            >
                                                                <option value="SCHEDULED">Agendada</option>
                                                                <option value="LIVE">Ao Vivo</option>
                                                                <option value="ENDED">Encerrada</option>
                                                            </select>
                                                            <button onClick={() => handleUpdateLive(lc.id)} className="admin-btn-primary" style={{ padding: '0.4rem 0.75rem' }}>
                                                                <Save size={14} />
                                                            </button>
                                                            <button onClick={() => setEditingLiveId(null)} className="admin-btn-secondary" style={{ padding: '0.4rem 0.75rem' }}>
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => { setEditingLiveId(lc.id); setEditingLiveStatus(lc.status); }}
                                                                className="admin-btn-secondary"
                                                                style={{ padding: '0.4rem 0.75rem' }}
                                                                title="Alterar status"
                                                            >
                                                                <Edit3 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteLive(lc.id, lc.title)}
                                                                className="admin-btn-danger"
                                                                style={{ padding: '0.4rem 0.75rem' }}
                                                                title="Remover"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: MODERATION */}
                    {activeTab === 'moderation' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Moderação de Comentários</h2>
                            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                                Comentários flagrados automaticamente pelo filtro de profanidade ou denunciados por alunos.
                            </p>

                            {flaggedComments.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                    <ShieldCheck size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                    <h3>Tudo limpo!</h3>
                                    <p>Nenhum comentário pendente de moderação.</p>
                                </div>
                            ) : (
                                <div className="admin-moderation-list">
                                    {flaggedComments.map((c) => (
                                        <div key={c.id} className="admin-mod-card">
                                            <div className="admin-mod-header">
                                                <div className="admin-mod-user">
                                                    <strong>{c.user.name}</strong>
                                                    <span className="admin-mod-role">{c.user.role}</span>
                                                    <span className="admin-mod-time">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
                                                </div>
                                                <div className="admin-mod-lesson">
                                                    {c.video.module.course.name} → {c.video.title}
                                                </div>
                                            </div>
                                            <div className="admin-mod-text">{c.text}</div>
                                            {c.flagged && (
                                                <span className="admin-mod-flag auto">
                                                    <Flag size={12} /> Filtro automático
                                                </span>
                                            )}
                                            {c.reports.length > 0 && (
                                                <div className="admin-mod-reports">
                                                    <strong><Flag size={12} /> {c.reports.length} denúncia(s):</strong>
                                                    {c.reports.map((r) => (
                                                        <div key={r.id} className="admin-mod-report-item">
                                                            <span>{r.user.name}:</span> {r.reason}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="admin-mod-actions">
                                                <button
                                                    className="admin-btn admin-btn-sm admin-btn-success"
                                                    onClick={async () => {
                                                        try {
                                                            await api.put(`/api/admin/comments/${c.id}/approve`, {}, {
                                                                headers: { Authorization: `Bearer ${token}` }
                                                            });
                                                            fetchData();
                                                        } catch { /* ignore */ }
                                                    }}
                                                >
                                                    <CheckCircle size={14} /> Aprovar
                                                </button>
                                                <button
                                                    className="admin-btn admin-btn-sm admin-btn-danger"
                                                    onClick={async () => {
                                                        try {
                                                            await api.delete(`/api/admin/comments/${c.id}`, {
                                                                headers: { Authorization: `Bearer ${token}` }
                                                            });
                                                            fetchData();
                                                        } catch { /* ignore */ }
                                                    }}
                                                >
                                                    <Trash2 size={14} /> Remover
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {flaggedTotalPages > 1 && (
                                <div className="admin-pagination">
                                    <button disabled={flaggedPage <= 1} onClick={() => setFlaggedPage(p => p - 1)}>Anterior</button>
                                    <span>Página {flaggedPage} de {flaggedTotalPages}</span>
                                    <button disabled={flaggedPage >= flaggedTotalPages} onClick={() => setFlaggedPage(p => p + 1)}>Próxima</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: PUNISHMENT */}
                    {activeTab === 'punishment' && (
                        <div className="admin-fade-in">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 className="admin-page-title" style={{ margin: 0 }}>Sistema de Punições</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <label className="punishment-toggle-label">
                                        <span style={{ color: punishmentEnabled ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                            {punishmentEnabled ? 'Ativo' : 'Desativado'}
                                        </span>
                                        <button
                                            className={`punishment-toggle-btn ${punishmentEnabled ? 'active' : ''}`}
                                            onClick={async () => {
                                                try {
                                                    const res = await api.put('/api/admin/punishment-toggle', {}, {
                                                        headers: { Authorization: `Bearer ${token}` }
                                                    });
                                                    setPunishmentEnabled(res.data.forumPunishmentEnabled);
                                                } catch { /* ignore */ }
                                            }}
                                        >
                                            <span className="punishment-toggle-thumb" />
                                        </button>
                                    </label>
                                    <button className="admin-btn admin-btn-sm" onClick={() => fetchData()}>
                                        <RefreshCw size={14} /> Atualizar
                                    </button>
                                </div>
                            </div>

                            {!punishmentEnabled && (
                                <div className="punishment-warning">
                                    <AlertTriangle size={20} />
                                    <span>O sistema de punição automática está <strong>desativado</strong>. Violações serão registradas, mas bans não serão aplicados automaticamente.</span>
                                </div>
                            )}

                            {/* Seção: Recursos (Appeals) */}
                            <div className="punishment-section">
                                <h3><Scale size={18} /> Recursos dos Alunos</h3>
                                <div className="punishment-filter-row">
                                    {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
                                        <button
                                            key={s}
                                            className={`punishment-filter-btn ${appealFilter === s ? 'active' : ''}`}
                                            onClick={() => setAppealFilter(s)}
                                        >
                                            {s === 'PENDING' ? 'Pendentes' : s === 'APPROVED' ? 'Aprovados' : 'Rejeitados'}
                                        </button>
                                    ))}
                                </div>
                                {appeals.length === 0 ? (
                                    <p className="punishment-empty">Nenhum recurso {appealFilter === 'PENDING' ? 'pendente' : appealFilter === 'APPROVED' ? 'aprovado' : 'rejeitado'}.</p>
                                ) : (
                                    <div className="punishment-list">
                                        {appeals.map((a) => (
                                            <div key={a.id} className="punishment-card appeal-card">
                                                <div className="punishment-card-header">
                                                    <strong>{a.user.name}</strong>
                                                    <span className="punishment-card-email">{a.user.email}</span>
                                                    <span className="punishment-card-time">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                                                </div>
                                                <div className="punishment-card-body">
                                                    <p className="punishment-card-reason">{a.reason}</p>
                                                </div>
                                                {a.status === 'PENDING' && (
                                                    <div className="punishment-card-actions">
                                                        <button
                                                            className="admin-btn admin-btn-sm admin-btn-success"
                                                            onClick={async () => {
                                                                try {
                                                                    await api.put(`/api/admin/appeals/${a.id}`, { status: 'APPROVED', adminNote: 'Recurso aceito' }, {
                                                                        headers: { Authorization: `Bearer ${token}` }
                                                                    });
                                                                    fetchData();
                                                                } catch { /* ignore */ }
                                                            }}
                                                        >
                                                            <CheckCircle size={14} /> Aprovar
                                                        </button>
                                                        <button
                                                            className="admin-btn admin-btn-sm admin-btn-danger"
                                                            onClick={async () => {
                                                                try {
                                                                    await api.put(`/api/admin/appeals/${a.id}`, { status: 'REJECTED', adminNote: 'Recurso negado' }, {
                                                                        headers: { Authorization: `Bearer ${token}` }
                                                                    });
                                                                    fetchData();
                                                                } catch { /* ignore */ }
                                                            }}
                                                        >
                                                            <X size={14} /> Rejeitar
                                                        </button>
                                                    </div>
                                                )}
                                                {a.adminNote && (
                                                    <div className="punishment-card-note">Nota: {a.adminNote}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Seção: Bans Ativos */}
                            <div className="punishment-section">
                                <h3><Ban size={18} /> Bans</h3>
                                {bans.length === 0 ? (
                                    <p className="punishment-empty">Nenhum ban registrado.</p>
                                ) : (
                                    <div className="punishment-list">
                                        {bans.map((b) => (
                                            <div key={b.id} className={`punishment-card ban-card ${b.active ? 'ban-active' : 'ban-expired'}`}>
                                                <div className="punishment-card-header">
                                                    <strong>{b.user.name}</strong>
                                                    <span className={`punishment-ban-type ${b.banType.toLowerCase()}`}>{b.banType.replace('_', ' ')}</span>
                                                    <span className={`punishment-ban-status ${b.active ? 'active' : 'inactive'}`}>
                                                        {b.active ? 'ATIVO' : 'Expirado'}
                                                    </span>
                                                </div>
                                                <div className="punishment-card-body">
                                                    <p><strong>Motivo:</strong> {b.reason}</p>
                                                    <p><strong>Criado:</strong> {new Date(b.createdAt).toLocaleString('pt-BR')}</p>
                                                    {b.expiresAt && <p><strong>Expira:</strong> {new Date(b.expiresAt).toLocaleString('pt-BR')}</p>}
                                                    {!b.expiresAt && <p><strong>Permanente</strong></p>}
                                                </div>
                                                {b.active && (
                                                    <div className="punishment-card-actions">
                                                        <button
                                                            className="admin-btn admin-btn-sm admin-btn-warning"
                                                            onClick={async () => {
                                                                try {
                                                                    await api.put(`/api/admin/bans/${b.id}/lift`, {}, {
                                                                        headers: { Authorization: `Bearer ${token}` }
                                                                    });
                                                                    fetchData();
                                                                } catch { /* ignore */ }
                                                            }}
                                                        >
                                                            Revogar Ban
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Seção: Ban Manual */}
                            <div className="punishment-section">
                                <h3><Plus size={18} /> Aplicar Ban Manual</h3>
                                <div className="punishment-manual-form">
                                    <select
                                        value={manualBanForm.userId}
                                        onChange={e => setManualBanForm({ ...manualBanForm, userId: e.target.value })}
                                        className="admin-input"
                                    >
                                        <option value="">Selecione o aluno...</option>
                                        {users.filter(u => u.role === 'STUDENT').map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                        ))}
                                    </select>
                                    <select
                                        value={manualBanForm.banType}
                                        onChange={e => setManualBanForm({ ...manualBanForm, banType: e.target.value })}
                                        className="admin-input"
                                    >
                                        <option value="TEMP_1D">1 Dia</option>
                                        <option value="TEMP_2D">2 Dias</option>
                                        <option value="TEMP_10D">10 Dias</option>
                                        <option value="PERMANENT">Permanente</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={manualBanForm.reason}
                                        onChange={e => setManualBanForm({ ...manualBanForm, reason: e.target.value })}
                                        placeholder="Motivo do ban..."
                                        className="admin-input"
                                    />
                                    <button
                                        className="admin-btn admin-btn-danger"
                                        disabled={!manualBanForm.userId || !manualBanForm.reason.trim()}
                                        onClick={async () => {
                                            try {
                                                await api.post('/api/admin/bans', manualBanForm, {
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                setManualBanForm({ userId: '', reason: '', banType: 'TEMP_1D' });
                                                fetchData();
                                            } catch { /* ignore */ }
                                        }}
                                    >
                                        <Ban size={14} /> Aplicar Ban
                                    </button>
                                </div>
                            </div>

                            {/* Seção: Histórico de Violações */}
                            <div className="punishment-section">
                                <h3><AlertTriangle size={18} /> Histórico de Violações</h3>
                                {violations.length === 0 ? (
                                    <p className="punishment-empty">Nenhuma violação registrada.</p>
                                ) : (
                                    <div className="punishment-table-wrap">
                                        <table className="punishment-table">
                                            <thead>
                                                <tr>
                                                    <th>Aluno</th>
                                                    <th>Palavra</th>
                                                    <th>Severidade</th>
                                                    <th>Ação</th>
                                                    <th>Data</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {violations.map((v) => (
                                                    <tr key={v.id}>
                                                        <td>{v.user.name}</td>
                                                        <td className="punishment-word">{v.word}</td>
                                                        <td>
                                                            <span className={`punishment-severity ${v.severity.toLowerCase()}`}>
                                                                {v.severity === 'LIGHT' ? 'Leve' : v.severity === 'MEDIUM' ? 'Média' : 'Grave'}
                                                            </span>
                                                        </td>
                                                        <td className="punishment-action-label">{v.autoAction}</td>
                                                        <td>{new Date(v.createdAt).toLocaleString('pt-BR')}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'broadcast' && user?.role === 'ADMIN' && (
                        <div className="admin-fade-in">
                            <BroadcastAdminPanel token={token || ''} />
                        </div>
                    )}

                    {activeTab === 'privaterooms' && (
                        <div className="admin-fade-in">
                            <PrivateRoomAdminPanel token={token || ''} />
                        </div>
                    )}

                    {/* TAB: SETTINGS */}
                    {activeTab === 'settings' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Configurações da Conta</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Altere seu nome de usuário e senha de acesso.</p>

                            <div className="settings-card">
                                {settingsMsg && (
                                    <div className={`settings-alert ${settingsMsg.type}`}>
                                        {settingsMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                        {settingsMsg.text}
                                    </div>
                                )}

                                <form onSubmit={handleUpdateProfile} className="settings-form">
                                    {/* Username */}
                                    <div className="settings-field">
                                        <label>Nome de Usuário</label>
                                        <input
                                            type="text"
                                            value={settingsForm.newUsername}
                                            onChange={e => setSettingsForm({ ...settingsForm, newUsername: e.target.value })}
                                            placeholder="Novo nome de usuário"
                                            className="settings-input"
                                        />
                                        <small style={{ color: 'var(--text-muted)' }}>
                                            Login atual: <strong>{user?.username || user?.email}</strong>
                                        </small>
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--glass-border)', margin: '1.5rem 0' }} />

                                    {/* Nova Senha */}
                                    <div className="settings-field">
                                        <label>Nova Senha</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showNewPass ? 'text' : 'password'}
                                                value={settingsForm.newPassword}
                                                onChange={e => setSettingsForm({ ...settingsForm, newPassword: e.target.value })}
                                                placeholder="Deixe em branco para manter a atual"
                                                className="settings-input"
                                            />
                                            <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="settings-eye-btn">
                                                {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="settings-field">
                                        <label>Confirmar Nova Senha</label>
                                        <input
                                            type="password"
                                            value={settingsForm.confirmPassword}
                                            onChange={e => setSettingsForm({ ...settingsForm, confirmPassword: e.target.value })}
                                            placeholder="Repita a nova senha"
                                            className="settings-input"
                                        />
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--glass-border)', margin: '1.5rem 0' }} />

                                    {/* Senha Atual (obrigatória para confirmar) */}
                                    <div className="settings-field">
                                        <label>Senha Atual <span style={{ color: 'var(--danger)' }}>*</span></label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showCurrentPass ? 'text' : 'password'}
                                                value={settingsForm.currentPassword}
                                                onChange={e => setSettingsForm({ ...settingsForm, currentPassword: e.target.value })}
                                                placeholder="Informe sua senha atual para confirmar"
                                                className="settings-input"
                                                required
                                            />
                                            <button type="button" onClick={() => setShowCurrentPass(!showCurrentPass)} className="settings-eye-btn">
                                                {showCurrentPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        <small style={{ color: 'var(--text-muted)' }}>Obrigatório para confirmar qualquer alteração.</small>
                                    </div>

                                    <button
                                        type="submit"
                                        className="settings-save-btn"
                                        disabled={settingsLoading}
                                    >
                                        <Save size={18} />
                                        {settingsLoading ? 'Salvando...' : 'Salvar Alterações'}
                                    </button>
                                </form>
                            </div>

                            <hr className="admin-divider" />

                            <h2 className="admin-page-title">Aparência da Plataforma (Branding Global)</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Personalize as cores, o nome e o logo. Estas alterações afetam todos os usuários imediatamente.</p>

                            <div className="settings-card">
                                {brandingMsg && (
                                    <div className={`settings-alert ${brandingMsg.type}`}>
                                        {brandingMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                        {brandingMsg.text}
                                    </div>
                                )}

                                <form onSubmit={handleUpdateBranding} className="settings-form">
                                    <div className="settings-field">
                                        <label>Nome da Plataforma (título da aba do navegador)</label>
                                        <input
                                            type="text"
                                            value={brandingForm.platformName}
                                            onChange={e => setBrandingForm({ ...brandingForm, platformName: e.target.value })}
                                            placeholder="Ex: EduVault"
                                            className="settings-input"
                                            required
                                        />
                                    </div>

                                    <div className="settings-field">
                                        <label>Nome Estilizado (aparece no header)</label>
                                        <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                            Divida o nome em duas partes para aplicar cores diferentes. Ex: <strong style={{ color: brandingForm.nameColor1 }}>{brandingForm.namePart1 || 'Edu'}</strong><strong style={{ color: brandingForm.nameColor2 }}>{brandingForm.namePart2 || 'Vault'}</strong>
                                        </small>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: '120px' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Parte 1</label>
                                                <input
                                                    type="text"
                                                    value={brandingForm.namePart1}
                                                    onChange={e => setBrandingForm({ ...brandingForm, namePart1: e.target.value })}
                                                    placeholder="Edu"
                                                    className="settings-input"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cor 1</label>
                                                <input
                                                    type="color"
                                                    value={brandingForm.nameColor1}
                                                    onChange={e => setBrandingForm({ ...brandingForm, nameColor1: e.target.value })}
                                                    style={{ width: '40px', height: '36px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                                                />
                                                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{brandingForm.nameColor1}</span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '120px' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Parte 2</label>
                                                <input
                                                    type="text"
                                                    value={brandingForm.namePart2}
                                                    onChange={e => setBrandingForm({ ...brandingForm, namePart2: e.target.value })}
                                                    placeholder="Vault"
                                                    className="settings-input"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cor 2</label>
                                                <input
                                                    type="color"
                                                    value={brandingForm.nameColor2}
                                                    onChange={e => setBrandingForm({ ...brandingForm, nameColor2: e.target.value })}
                                                    style={{ width: '40px', height: '36px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                                                />
                                                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{brandingForm.nameColor2}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="settings-field">
                                        <label>Cor Primária (Tema)</label>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <input
                                                type="color"
                                                value={brandingForm.primaryColor}
                                                onChange={e => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                                                style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                                                required
                                            />
                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{brandingForm.primaryColor}</span>
                                        </div>
                                    </div>

                                    <div className="settings-field">
                                        <label>Cor de Destaque (Accent)</label>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <input
                                                type="color"
                                                value={brandingForm.accentColor}
                                                onChange={e => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                                                style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                                                required
                                            />
                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{brandingForm.accentColor}</span>
                                        </div>
                                    </div>

                                    <div className="settings-field">
                                        <label>Logo da Plataforma</label>
                                        {brandingForm.logoUrl && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <img src={`${API_BASE}${brandingForm.logoUrl}`} alt="Logo Preview" style={{ maxHeight: '60px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/svg+xml"
                                            onChange={handleUploadBrandLogo}
                                            disabled={brandingLoading}
                                            style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}
                                        />
                                        <small style={{ color: 'var(--text-muted)' }}>Faça o upload de uma imagem PNG ou SVG com fundo transparente.</small>
                                    </div>

                                    <div className="settings-field">
                                        <label>Banner do Dashboard (Aluno)</label>
                                        {brandingForm.bannerUrl && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <img src={`${API_BASE}${brandingForm.bannerUrl}`} alt="Banner Preview" style={{ maxHeight: '120px', width: '100%', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--glass-border)' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => setBrandingForm({ ...brandingForm, bannerUrl: '' })}
                                                    style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    <X size={14} /> Remover banner
                                                </button>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp"
                                            onChange={handleUploadBanner}
                                            disabled={brandingLoading}
                                            style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}
                                        />
                                        <small style={{ color: 'var(--text-muted)' }}>Imagem horizontal (recomendado: 1400×300px). Aparece no topo do painel do aluno.</small>
                                    </div>

                                    <button type="submit" className="settings-save-btn" disabled={brandingLoading} style={{ marginTop: '1.5rem', alignSelf: 'flex-start' }}>
                                        {brandingLoading ? 'Salvando...' : (
                                            <>
                                                <Save size={18} /> Salvar Aparência
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* TAB: ATTENDANCE */}
                    {activeTab === 'attendance' && (
                        <div className="admin-fade-in">
                            <h2 className="admin-page-title">Controle de Presença</h2>

                            {/* Attendance Config Card */}
                            <div className="admin-card" style={{ marginBottom: '2rem' }}>
                                <h3 style={{ marginBottom: '1rem' }}>Configurações de Presença</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Sistema de Presença</label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={attendanceConfig.attendanceEnabled}
                                                onChange={e => setAttendanceConfig(prev => ({ ...prev, attendanceEnabled: e.target.checked }))}
                                                style={{ width: '18px', height: '18px' }}
                                            />
                                            <span style={{ fontWeight: 600 }}>{attendanceConfig.attendanceEnabled ? 'Ativado' : 'Desativado'}</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Tempo Mínimo (minutos)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={180}
                                            value={attendanceConfig.attendanceMinMinutes}
                                            onChange={e => setAttendanceConfig(prev => ({ ...prev, attendanceMinMinutes: parseInt(e.target.value) || 20 }))}
                                            className="admin-input"
                                            style={{ width: '120px' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Modo</label>
                                        <select
                                            value={attendanceConfig.attendanceMode}
                                            onChange={e => setAttendanceConfig(prev => ({ ...prev, attendanceMode: e.target.value }))}
                                            className="admin-select"
                                            style={{ minWidth: '200px' }}
                                        >
                                            <option value="DATE_ONLY">Somente na Data do Módulo</option>
                                            <option value="FREE">Livre (Qualquer Data)</option>
                                        </select>
                                    </div>
                                    <button onClick={handleSaveAttendanceConfig} className="admin-btn-primary">
                                        <Save size={16} /> Salvar Configuração
                                    </button>
                                </div>
                            </div>

                            {/* Attendance Filter */}
                            <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
                                <h3 style={{ marginBottom: '1rem' }}>Filtrar Presença</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Curso</label>
                                        <select
                                            value={attendanceFilter.courseId}
                                            onChange={e => {
                                                const courseId = e.target.value;
                                                setAttendanceFilter(prev => ({ ...prev, courseId, moduleId: '' }));
                                                const course = courses.find(c => c.id === courseId);
                                                setAttendanceModules(course?.modules || []);
                                                setAttendanceData([]);
                                            }}
                                            className="admin-select"
                                            style={{ minWidth: '250px' }}
                                        >
                                            <option value="">Selecione um curso...</option>
                                            {courses.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Módulo</label>
                                        <select
                                            value={attendanceFilter.moduleId}
                                            onChange={e => setAttendanceFilter(prev => ({ ...prev, moduleId: e.target.value }))}
                                            className="admin-select"
                                            style={{ minWidth: '250px' }}
                                            disabled={!attendanceFilter.courseId}
                                        >
                                            <option value="">Selecione um módulo...</option>
                                            {attendanceModules.map((m) => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Data</label>
                                        <input
                                            type="date"
                                            value={attendanceFilter.date}
                                            onChange={e => setAttendanceFilter(prev => ({ ...prev, date: e.target.value }))}
                                            className="admin-input"
                                        />
                                    </div>
                                    <button
                                        onClick={fetchAttendance}
                                        disabled={!attendanceFilter.moduleId || !attendanceFilter.date}
                                        className="admin-btn-primary"
                                    >
                                        <Eye size={16} /> Buscar
                                    </button>
                                </div>
                            </div>

                            {/* Attendance List */}
                            {attendanceData.length > 0 && (
                                <div className="admin-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3>Lista de Presença — {attendanceData.length} aluno(s)</h3>
                                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                                            <span style={{ color: '#22c55e', fontWeight: 600 }}>
                                                ✓ Presentes: {attendanceData.filter((a) => a.status === 'PRESENT').length}
                                            </span>
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                                ✗ Ausentes: {attendanceData.filter((a) => a.status === 'ABSENT').length}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--glass-border)', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Aluno</th>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Email</th>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tempo Assistido</th>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status</th>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Detecção</th>
                                                    <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {attendanceData.map((att, idx) => (
                                                    <tr key={att.id || `absent-${att.userId}`} style={{ borderBottom: '1px solid var(--glass-border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                                        <td style={{ padding: '0.75rem', fontWeight: 500 }}>{att.user?.name || 'N/A'}</td>
                                                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{att.user?.email || 'N/A'}</td>
                                                        <td style={{ padding: '0.75rem' }}>
                                                            {Math.floor((att.watchTimeSeconds || 0) / 60)}min {(att.watchTimeSeconds || 0) % 60}s
                                                        </td>
                                                        <td style={{ padding: '0.75rem' }}>
                                                            <span style={{
                                                                padding: '0.2rem 0.6rem',
                                                                borderRadius: '6px',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                background: att.status === 'PRESENT' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                                                color: att.status === 'PRESENT' ? '#22c55e' : '#ef4444'
                                                            }}>
                                                                {att.status === 'PRESENT' ? '✓ Presente' : '✗ Ausente'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            {att.autoDetected ? '🤖 Auto' : att.id ? '✏️ Manual' : '—'}
                                                        </td>
                                                        <td style={{ padding: '0.75rem' }}>
                                                            <button
                                                                onClick={() => {
                                                                    setAttendanceEditModal({
                                                                        id: att.id || '',
                                                                        userId: att.userId,
                                                                        moduleId: attendanceFilter.moduleId,
                                                                        date: attendanceFilter.date,
                                                                        currentStatus: att.status
                                                                    });
                                                                    setAttendanceEditForm({
                                                                        status: att.status === 'PRESENT' ? 'ABSENT' : 'PRESENT',
                                                                        justification: ''
                                                                    });
                                                                }}
                                                                className="admin-btn-icon primary"
                                                                title="Editar presença"
                                                            >
                                                                <Edit3 size={14} />
                                                            </button>
                                                            {/* Show edit history */}
                                                            {att.edits && att.edits.length > 0 && (
                                                                <span title={att.edits.map((ed) => `${ed.editedBy?.name}: ${ed.oldStatus}→${ed.newStatus} - ${ed.justification}`).join('\n')} style={{ marginLeft: '0.5rem', cursor: 'help', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                    📝 {att.edits.length} edição(ões)
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {attendanceFilter.moduleId && attendanceFilter.date && attendanceData.length === 0 && (
                                <div className="admin-empty-box">
                                    Nenhum registro de presença encontrado para este módulo e data.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Attendance Edit Modal */}
                    {attendanceEditModal && (
                        <div className="modal-overlay" onClick={() => setAttendanceEditModal(null)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                                <h3 style={{ marginBottom: '1rem' }}>Editar Presença</h3>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    Status atual: <strong>{attendanceEditModal.currentStatus === 'PRESENT' ? 'Presente' : 'Ausente'}</strong>
                                </p>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.3rem' }}>Novo Status</label>
                                    <select
                                        value={attendanceEditForm.status}
                                        onChange={e => setAttendanceEditForm(prev => ({ ...prev, status: e.target.value }))}
                                        className="admin-select"
                                    >
                                        <option value="PRESENT">Presente</option>
                                        <option value="ABSENT">Ausente</option>
                                    </select>
                                </div>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.3rem' }}>Justificativa *</label>
                                    <textarea
                                        value={attendanceEditForm.justification}
                                        onChange={e => setAttendanceEditForm(prev => ({ ...prev, justification: e.target.value }))}
                                        className="admin-input"
                                        rows={3}
                                        placeholder="Motivo da alteração (obrigatório)..."
                                        required
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                    <small style={{ color: 'var(--text-muted)' }}>Esta justificativa será registrada no log de auditoria.</small>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setAttendanceEditModal(null)} className="admin-btn-danger" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                        Cancelar
                                    </button>
                                    <button onClick={handleAttendanceEdit} disabled={!attendanceEditForm.justification.trim()} className="admin-btn-primary">
                                        <Save size={16} /> Salvar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </div>

        {/* Full-screen Editor Modal */}
        {editingVideoId && (
            <div className="editor-modal-overlay" onClick={() => { setEditingVideoId(null); setEditBlocks([]); setEditorModalMode('edit'); }}>
                <div className="editor-modal" onClick={e => e.stopPropagation()}>
                    <div className="editor-modal-header">
                        <h2>Editar Aula</h2>
                        <div className="editor-modal-actions">
                            <div className="editor-modal-tabs">
                                <button className={`editor-modal-tab ${editorModalMode === 'edit' ? 'active' : ''}`} onClick={() => setEditorModalMode('edit')}>
                                    <Edit3 size={14} /> Editor
                                </button>
                                <button className={`editor-modal-tab ${editorModalMode === 'preview' ? 'active' : ''}`} onClick={() => setEditorModalMode('preview')}>
                                    <Eye size={14} /> Visualizar como Aluno
                                </button>
                            </div>
                            <button className="editor-modal-save" onClick={() => handleEditVideo(editingVideoId)}>
                                <Save size={14} /> Salvar
                            </button>
                            <button className="editor-modal-close" onClick={() => { setEditingVideoId(null); setEditBlocks([]); setEditorModalMode('edit'); }}>
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="editor-modal-body">
                        {editorModalMode === 'edit' ? (
                            <div className="editor-modal-edit">
                                <div className="editor-modal-fields">
                                    <input value={editVideoData.title} onChange={e => setEditVideoData({ ...editVideoData, title: e.target.value })} placeholder="Título da aula" className="admin-input" />
                                    <input value={editVideoData.description} onChange={e => setEditVideoData({ ...editVideoData, description: e.target.value })} placeholder="Descrição" className="admin-input" />
                                </div>
                                <BlockEditor blocks={editBlocks} onChange={setEditBlocks} token={token || ''} />
                            </div>
                        ) : (
                            <div className="editor-modal-preview">
                                <div className="lp-sheet">
                                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>{editVideoData.title}</h1>
                                    {editVideoData.description && <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>{editVideoData.description}</p>}
                                    {editBlocks.length > 0 ? (
                                        <BlockRenderer blocks={editBlocks} />
                                    ) : editVideoData.content ? (
                                        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editVideoData.content) }} />
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>Nenhum conteúdo adicionado ainda.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Confirm Modal */}
        <ConfirmModal
            open={!!confirmAction}
            message={confirmAction?.message || ''}
            onConfirm={() => { confirmAction?.action(); setConfirmAction(null); }}
            onCancel={() => setConfirmAction(null)}
        />
        </>
    );
}
