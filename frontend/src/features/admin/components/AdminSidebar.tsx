import { Activity, Ban, BarChart3, Bell, BookOpen, CheckCircle, ClipboardList, Key, RadioTower, School, Settings, ShieldCheck, Users, Video } from 'lucide-react';
import type { AdminTab } from '../types';

interface AdminSidebarProps {
    activeTab: AdminTab;
    flaggedTotal: number;
    isTeacher: boolean;
    onSelectTab: (tab: AdminTab) => void;
}

export function AdminSidebar({ activeTab, flaggedTotal, isTeacher, onSelectTab }: AdminSidebarProps) {
    const navClass = (tab: AdminTab) => `admin-nav-btn ${activeTab === tab ? 'active' : ''}`;

    return (
        <aside className="admin-sidebar">
            {!isTeacher && (
                <button onClick={() => onSelectTab('overview')} className={navClass('overview')}>
                    <Activity size={20} /> Visão Geral
                </button>
            )}
            <span className="admin-sidebar-section-label">Gestão acadêmica</span>
            <button onClick={() => onSelectTab('courses')} className={navClass('courses')}>
                <BookOpen size={20} /> {isTeacher ? 'Meus Cursos' : 'Cursos e Conteúdos'}
            </button>
            <button onClick={() => window.location.assign('/school')} className="admin-nav-btn">
                <School size={20} /> Escola 360
            </button>
            {!isTeacher && (
                <>
                    <button onClick={() => onSelectTab('live')} className={navClass('live')}>
                        <Video size={20} /> Aulas ao Vivo
                    </button>
                    <button onClick={() => onSelectTab('attendance')} className={navClass('attendance')}>
                        <CheckCircle size={20} /> Presença
                    </button>
                </>
            )}

            {!isTeacher && <span className="admin-sidebar-section-label">Usuários e acessos</span>}
            {!isTeacher && (
                <button onClick={() => onSelectTab('users')} className={navClass('users')}>
                    <Users size={20} /> Usuários
                </button>
            )}
            {!isTeacher && (
                <>
                    <button onClick={() => onSelectTab('audit')} className={navClass('audit')}>
                        <ClipboardList size={20} /> Logs do Sistema
                    </button>
                    <button onClick={() => onSelectTab('reports')} className={navClass('reports')}>
                        <BarChart3 size={20} /> Relatórios de Acesso
                    </button>
                    <span className="admin-sidebar-section-label">Comunicação e segurança</span>
                    <button onClick={() => onSelectTab('notifications')} className={navClass('notifications')}>
                        <Bell size={20} /> Notificações
                    </button>
                    <button onClick={() => onSelectTab('moderation')} className={navClass('moderation')}>
                        <ShieldCheck size={20} /> Moderação
                        {flaggedTotal > 0 && <span className="admin-nav-badge">{flaggedTotal}</span>}
                    </button>
                    <button onClick={() => onSelectTab('punishment')} className={navClass('punishment')}>
                        <Ban size={20} /> Punições
                    </button>
                    <span className="admin-sidebar-section-label">Experiências</span>
                    <button onClick={() => onSelectTab('broadcast')} className={navClass('broadcast')}>
                        <RadioTower size={20} /> Campus ao Vivo
                    </button>
                </>
            )}

            <button onClick={() => onSelectTab('privaterooms')} className={navClass('privaterooms')}>
                <Key size={20} /> Salas Privadas
            </button>

            <span className="admin-sidebar-section-label">Configurações</span>
            <button onClick={() => onSelectTab('settings')} className={navClass('settings')}>
                <Settings size={20} /> Configurações
            </button>
        </aside>
    );
}
