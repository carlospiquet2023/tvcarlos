import type { FormEvent } from 'react';
import { Bell, LogOut, Menu, Search, ShieldCheck } from 'lucide-react';
import type { User } from '../../../context/AuthContext';
import type { PlatformConfig } from '../../../context/ConfigContext';
import { resolveMediaUrl } from '../../../lib/urls';
import type { AdminTab } from '../types';
import { roleLabel } from '../utils';

interface AdminHeaderProps {
    config: PlatformConfig;
    globalSearch: string;
    isTeacher: boolean;
    sidebarCollapsed: boolean;
    user: User | null;
    onGlobalSearchChange: (value: string) => void;
    onGlobalSearchSubmit: (event: FormEvent) => void;
    onLogout: () => void;
    onSelectTab: (tab: AdminTab) => void;
    onToggleSidebar: () => void;
}

export function AdminHeader({
    config,
    globalSearch,
    isTeacher,
    sidebarCollapsed,
    user,
    onGlobalSearchChange,
    onGlobalSearchSubmit,
    onLogout,
    onSelectTab,
    onToggleSidebar
}: AdminHeaderProps) {
    return (
        <header className="admin-header admin-pro-header">
            <div className="admin-header-brand">
                {config.logoUrl ? (
                    <img src={resolveMediaUrl(config.logoUrl)} alt={config.platformName} />
                ) : <ShieldCheck size={31} aria-hidden="true" />}
                <h2 className="admin-brand">
                    <span style={{ color: config.nameColor1 }}>{config.namePart1}</span>
                    <span style={{ color: config.nameColor2 }}>{config.namePart2}</span>
                    <em>{isTeacher ? 'Professor' : 'Admin'}</em>
                </h2>
                <button type="button" className="admin-menu-btn" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!sidebarCollapsed}><Menu size={20} /></button>
            </div>

            {!isTeacher && (
                <form className="admin-global-search" onSubmit={onGlobalSearchSubmit}>
                    <Search size={17} aria-hidden="true" />
                    <input value={globalSearch} onChange={event => onGlobalSearchChange(event.target.value)} placeholder="Buscar alunos por nome ou e-mail..." aria-label="Busca global" />
                </form>
            )}

            <div className="admin-header-right">
                {!isTeacher && <button type="button" className="admin-header-icon" onClick={() => onSelectTab('notifications')} title="Notificações"><Bell size={18} /></button>}
                <span className="admin-avatar">{user?.name?.charAt(0).toUpperCase()}</span>
                <span className="admin-user-info"><strong>{user?.name}</strong><small>{roleLabel(user?.role || '')}</small></span>
                <button onClick={onLogout} className="admin-logout-btn" title="Sair"><LogOut size={17} /><span>Sair</span></button>
            </div>
        </header>
    );
}
