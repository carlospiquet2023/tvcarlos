import { AlertTriangle, Ban, CheckCircle, Plus, RefreshCw, Scale, X } from 'lucide-react';
import type { AppealData, BanData, UserData, ViolationData } from '../types';

export interface ManualBanForm { userId: string; reason: string; banType: string }

interface AdminPunishmentProps {
    appeals: AppealData[];
    appealFilter: string;
    bans: BanData[];
    enabled: boolean;
    manualBan: ManualBanForm;
    users: UserData[];
    violations: ViolationData[];
    onAppealFilterChange: (filter: string) => void;
    onManualBanChange: (form: ManualBanForm) => void;
    onApplyBan: () => Promise<void>;
    onLiftBan: (id: string) => Promise<void>;
    onRefresh: () => void;
    onReviewAppeal: (id: string, status: 'APPROVED' | 'REJECTED') => Promise<void>;
    onToggle: () => Promise<void>;
}

const appealLabel = (status: string) => status === 'PENDING' ? 'Pendentes' : status === 'APPROVED' ? 'Aprovados' : 'Rejeitados';

export function AdminPunishment({ appeals, appealFilter, bans, enabled, manualBan, users, violations, onAppealFilterChange, onManualBanChange, onApplyBan, onLiftBan, onRefresh, onReviewAppeal, onToggle }: AdminPunishmentProps) {
    return (
        <div className="admin-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 className="admin-page-title" style={{ margin: 0 }}>Sistema de Punições</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label className="punishment-toggle-label"><span style={{ color: enabled ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{enabled ? 'Ativo' : 'Desativado'}</span><button className={`punishment-toggle-btn ${enabled ? 'active' : ''}`} onClick={() => void onToggle()}><span className="punishment-toggle-thumb" /></button></label>
                    <button className="admin-btn admin-btn-sm" onClick={onRefresh}><RefreshCw size={14} /> Atualizar</button>
                </div>
            </div>
            {!enabled && <div className="punishment-warning"><AlertTriangle size={20} /><span>O sistema de punição automática está <strong>desativado</strong>. Violações serão registradas, mas bans não serão aplicados automaticamente.</span></div>}

            <div className="punishment-section">
                <h3><Scale size={18} /> Recursos dos Alunos</h3>
                <div className="punishment-filter-row">{['PENDING', 'APPROVED', 'REJECTED'].map(status => <button key={status} className={`punishment-filter-btn ${appealFilter === status ? 'active' : ''}`} onClick={() => onAppealFilterChange(status)}>{appealLabel(status)}</button>)}</div>
                {appeals.length === 0 ? <p className="punishment-empty">Nenhum recurso {appealLabel(appealFilter).toLowerCase()}.</p> : (
                    <div className="punishment-list">{appeals.map(appeal => <div key={appeal.id} className="punishment-card appeal-card">
                        <div className="punishment-card-header"><strong>{appeal.user.name}</strong><span className="punishment-card-email">{appeal.user.email}</span><span className="punishment-card-time">{new Date(appeal.createdAt).toLocaleString('pt-BR')}</span></div>
                        <div className="punishment-card-body"><p className="punishment-card-reason">{appeal.reason}</p></div>
                        {appeal.status === 'PENDING' && <div className="punishment-card-actions"><button className="admin-btn admin-btn-sm admin-btn-success" onClick={() => void onReviewAppeal(appeal.id, 'APPROVED')}><CheckCircle size={14} /> Aprovar</button><button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => void onReviewAppeal(appeal.id, 'REJECTED')}><X size={14} /> Rejeitar</button></div>}
                        {appeal.adminNote && <div className="punishment-card-note">Nota: {appeal.adminNote}</div>}
                    </div>)}</div>
                )}
            </div>

            <div className="punishment-section">
                <h3><Ban size={18} /> Bans</h3>
                {bans.length === 0 ? <p className="punishment-empty">Nenhum ban registrado.</p> : <div className="punishment-list">{bans.map(ban => <div key={ban.id} className={`punishment-card ban-card ${ban.active ? 'ban-active' : 'ban-expired'}`}>
                    <div className="punishment-card-header"><strong>{ban.user.name}</strong><span className={`punishment-ban-type ${ban.banType.toLowerCase()}`}>{ban.banType.replace('_', ' ')}</span><span className={`punishment-ban-status ${ban.active ? 'active' : 'inactive'}`}>{ban.active ? 'ATIVO' : 'Expirado'}</span></div>
                    <div className="punishment-card-body"><p><strong>Motivo:</strong> {ban.reason}</p><p><strong>Criado:</strong> {new Date(ban.createdAt).toLocaleString('pt-BR')}</p>{ban.expiresAt ? <p><strong>Expira:</strong> {new Date(ban.expiresAt).toLocaleString('pt-BR')}</p> : <p><strong>Permanente</strong></p>}</div>
                    {ban.active && <div className="punishment-card-actions"><button className="admin-btn admin-btn-sm admin-btn-warning" onClick={() => void onLiftBan(ban.id)}>Revogar Ban</button></div>}
                </div>)}</div>}
            </div>

            <div className="punishment-section">
                <h3><Plus size={18} /> Aplicar Ban Manual</h3>
                <div className="punishment-manual-form">
                    <select value={manualBan.userId} onChange={event => onManualBanChange({ ...manualBan, userId: event.target.value })} className="admin-input"><option value="">Selecione o aluno...</option>{users.filter(user => user.role === 'STUDENT').map(user => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select>
                    <select value={manualBan.banType} onChange={event => onManualBanChange({ ...manualBan, banType: event.target.value })} className="admin-input"><option value="TEMP_1D">1 Dia</option><option value="TEMP_2D">2 Dias</option><option value="TEMP_10D">10 Dias</option><option value="PERMANENT">Permanente</option></select>
                    <input type="text" value={manualBan.reason} onChange={event => onManualBanChange({ ...manualBan, reason: event.target.value })} placeholder="Motivo do ban..." className="admin-input" />
                    <button className="admin-btn admin-btn-danger" disabled={!manualBan.userId || !manualBan.reason.trim()} onClick={() => void onApplyBan()}><Ban size={14} /> Aplicar Ban</button>
                </div>
            </div>

            <div className="punishment-section">
                <h3><AlertTriangle size={18} /> Histórico de Violações</h3>
                {violations.length === 0 ? <p className="punishment-empty">Nenhuma violação registrada.</p> : <div className="punishment-table-wrap"><table className="punishment-table"><thead><tr><th>Aluno</th><th>Palavra</th><th>Severidade</th><th>Ação</th><th>Data</th></tr></thead><tbody>{violations.map(violation => <tr key={violation.id}><td>{violation.user.name}</td><td className="punishment-word">{violation.word}</td><td><span className={`punishment-severity ${violation.severity.toLowerCase()}`}>{violation.severity === 'LIGHT' ? 'Leve' : violation.severity === 'MEDIUM' ? 'Média' : 'Grave'}</span></td><td className="punishment-action-label">{violation.autoAction}</td><td>{new Date(violation.createdAt).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>}
            </div>
        </div>
    );
}
