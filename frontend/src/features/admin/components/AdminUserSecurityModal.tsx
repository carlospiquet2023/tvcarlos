import type { FormEvent } from 'react';
import { LockKeyhole, UserX, X } from 'lucide-react';
import type { UserData } from '../types';

export interface UserSecurityForm { password: string; confirmPassword: string; reason: string }
export interface UserSecurityAction { mode: 'password' | 'block'; user: UserData }

interface AdminUserSecurityModalProps {
    action: UserSecurityAction;
    error: string;
    form: UserSecurityForm;
    loading: boolean;
    onChange: (form: UserSecurityForm) => void;
    onClose: () => void;
    onSubmit: (event: FormEvent) => void;
}

export function AdminUserSecurityModal({ action, error, form, loading, onChange, onClose, onSubmit }: AdminUserSecurityModalProps) {
    const passwordMode = action.mode === 'password';
    return (
        <div className="modal-overlay" onClick={() => !loading && onClose()}>
            <form className="modal-content admin-user-security-modal" onSubmit={onSubmit} onClick={event => event.stopPropagation()}>
                <button type="button" className="confirm-modal-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
                <span className={`admin-security-modal-icon ${action.mode}`}>{passwordMode ? <LockKeyhole size={27} /> : <UserX size={27} />}</span>
                <div><small>{passwordMode ? 'CREDENCIAIS' : 'CONTROLE DE ACESSO'}</small><h2>{passwordMode ? 'Redefinir senha' : 'Bloquear usuário'}</h2><p>{action.user.name} · {action.user.email}</p></div>
                {passwordMode ? <><label>Nova senha<input type="password" className="admin-input" value={form.password} onChange={event => onChange({ ...form, password: event.target.value })} minLength={8} autoComplete="new-password" required /></label><label>Confirmar nova senha<input type="password" className="admin-input" value={form.confirmPassword} onChange={event => onChange({ ...form, confirmPassword: event.target.value })} minLength={8} autoComplete="new-password" required /></label><p className="admin-security-note">Matrículas, progresso, certificados e histórico serão preservados. As sessões atuais serão encerradas e a troca da senha será exigida no próximo acesso.</p></> : <><label>Motivo do bloqueio<textarea className="admin-textarea" value={form.reason} onChange={event => onChange({ ...form, reason: event.target.value })} maxLength={500} placeholder="Ex.: suspensão temporária determinada pela direção" required /></label><p className="admin-security-note">O acesso às aulas e APIs será interrompido e todas as sessões serão revogadas. Nenhum dado acadêmico será apagado.</p></>}
                {error && <div className="settings-alert error">{error}</div>}
                <div className="admin-security-modal-actions"><button type="button" className="admin-btn" onClick={onClose} disabled={loading}>Cancelar</button><button type="submit" className={action.mode === 'block' ? 'admin-btn-danger solid' : 'admin-btn-primary'} disabled={loading}>{loading ? 'Processando...' : passwordMode ? 'Redefinir e revogar sessões' : 'Bloquear acesso'}</button></div>
            </form>
        </div>
    );
}
