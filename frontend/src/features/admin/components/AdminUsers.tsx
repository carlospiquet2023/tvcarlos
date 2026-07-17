import type { FormEvent } from 'react';
import { Download, Edit3, FileSpreadsheet, LockKeyhole, LogOut, Plus, Save, Trash2, UserCheck, UserX, X } from 'lucide-react';
import type { ConfirmationRequest, EditUserForm, EmailDeliveryData, ExcelImportResult, NewUserForm, UserData } from '../types';
import { roleLabel } from '../utils';

interface AdminUsersProps {
    currentUserId?: string;
    editForm: EditUserForm;
    editingUserId: string | null;
    excelDelivery: EmailDeliveryData | null;
    excelResults: ExcelImportResult[] | null;
    excelUploading: boolean;
    newUser: NewUserForm;
    page: number;
    search: string;
    searchInput: string;
    total: number;
    totalPages: number;
    users: UserData[];
    onCancelEdit: () => void;
    onClearSearch: () => void;
    onCreateUser: (event: FormEvent) => void;
    onDeleteUser: (id: string) => Promise<void>;
    onEditFormChange: (form: EditUserForm) => void;
    onExcelUpload: (file: File) => Promise<void>;
    onExport: () => Promise<void>;
    onNewUserChange: (form: NewUserForm) => void;
    onOpenSecurity: (mode: 'password' | 'block', user: UserData) => void;
    onPageChange: (page: number) => void;
    onRequestConfirmation: ConfirmationRequest;
    onRevokeSessions: (user: UserData) => Promise<void>;
    onSaveUser: (user: UserData) => Promise<void>;
    onSearch: () => void;
    onSearchInputChange: (value: string) => void;
    onStartEdit: (user: UserData) => void;
    onUnblockUser: (user: UserData) => Promise<void>;
}

export function AdminUsers({
    currentUserId,
    editForm,
    editingUserId,
    excelDelivery,
    excelResults,
    excelUploading,
    newUser,
    page,
    search,
    searchInput,
    total,
    totalPages,
    users,
    onCancelEdit,
    onClearSearch,
    onCreateUser,
    onDeleteUser,
    onEditFormChange,
    onExcelUpload,
    onExport,
    onNewUserChange,
    onOpenSecurity,
    onPageChange,
    onRequestConfirmation,
    onRevokeSessions,
    onSaveUser,
    onSearch,
    onSearchInputChange,
    onStartEdit,
    onUnblockUser
}: AdminUsersProps) {
    return (
        <div className="admin-fade-in">
            <h2 className="admin-page-title">Gerenciar Alunos</h2>

            <div className="admin-card">
                <h3>Cadastrar Novo Acesso</h3>
                <form onSubmit={onCreateUser} className="admin-form-row">
                    <input placeholder="Nome" value={newUser.name} onChange={event => onNewUserChange({ ...newUser, name: event.target.value })} required className="admin-input" />
                    <input type="email" placeholder="Email" value={newUser.email} onChange={event => onNewUserChange({ ...newUser, email: event.target.value })} required className="admin-input" />
                    <input type="password" placeholder="Senha" value={newUser.password} onChange={event => onNewUserChange({ ...newUser, password: event.target.value })} required className="admin-input" />
                    <select value={newUser.role} onChange={event => onNewUserChange({ ...newUser, role: event.target.value })} className="admin-input">
                        <option value="STUDENT">Aluno</option>
                        <option value="TEACHER">Professor</option>
                        <option value="ADMIN">Admin</option>
                        <option value="STAFF">Equipe escolar</option>
                        <option value="GUARDIAN">Responsável</option>
                    </select>
                    <button type="submit" className="admin-btn-primary"><Plus size={16} /> Salvar</button>
                </form>
            </div>

            <div className="admin-card">
                <h3><FileSpreadsheet size={18} /> Importar Alunos via Excel</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    Cabeçários: <strong>aluno</strong>, <strong>matricula</strong>, <strong>turma</strong>, <strong>cpf</strong> e <strong>email</strong> (recomendado). Sem um e-mail real, o sistema gera apenas um login técnico e não há como entregar as credenciais ao aluno.
                </p>
                <div className="admin-form-row">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) void onExcelUpload(file);
                            event.target.value = '';
                        }}
                        disabled={excelUploading}
                        style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1 }}
                    />
                    {excelUploading && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Processando...</span>}
                </div>
                {excelResults && (
                    <div className="excel-results">
                        <h4>Resultado da Importação ({excelResults.length} alunos)</h4>
                        {excelDelivery && (
                            <p style={{ margin: '0.65rem 0', color: excelDelivery.configured ? 'var(--text-secondary)' : '#92400e', fontSize: '0.85rem' }}>
                                {excelDelivery.configured
                                    ? `E-mails elegíveis: ${excelDelivery.eligible || 0}. Entregues: ${excelDelivery.sent}. Falhas: ${excelDelivery.failed}.`
                                    : `SMTP não configurado: ${(excelDelivery.eligible || 0)} credencial(is) com e-mail real não foram enviadas.`}
                            </p>
                        )}
                        <table className="admin-table">
                            <thead><tr><th>Nome</th><th>Email</th><th>Senha</th><th>Matriculado em</th><th>Status</th></tr></thead>
                            <tbody>
                                {excelResults.map((result, index) => (
                                    <tr key={index}>
                                        <td>{result.name}</td>
                                        <td>{result.email}</td>
                                        <td>{result.password ? <code>{result.password}</code> : '—'}</td>
                                        <td>{result.enrolled.length > 0 ? result.enrolled.join(', ') : '—'}</td>
                                        <td>{result.error ? <span className="admin-status-badge error">{result.error}</span> : <span className="admin-status-badge ready">OK</span>}</td>
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
                    value={searchInput}
                    onChange={event => onSearchInputChange(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') onSearch(); }}
                    className="admin-input"
                    style={{ flex: 1 }}
                />
                <button onClick={onSearch} className="admin-btn primary" style={{ whiteSpace: 'nowrap' }}>Buscar</button>
                {search && <button onClick={onClearSearch} className="admin-btn" style={{ whiteSpace: 'nowrap' }}>Limpar</button>}
                <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{total} usuário(s)</span>
            </div>

            <table className="admin-table">
                <thead><tr><th>Nome</th><th>Email</th><th>Permissão</th><th>Status de acesso</th><th>Ações</th></tr></thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td>{editingUserId === user.id ? <input value={editForm.name} onChange={event => onEditFormChange({ ...editForm, name: event.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }} /> : user.name}</td>
                            <td>{editingUserId === user.id ? <input type="email" value={editForm.email} onChange={event => onEditFormChange({ ...editForm, email: event.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }} /> : user.email}</td>
                            <td>
                                {editingUserId === user.id ? (
                                    <select value={editForm.role} onChange={event => onEditFormChange({ ...editForm, role: event.target.value })} className="admin-input" style={{ margin: 0, padding: '0.3rem 0.5rem' }}>
                                        <option value="STUDENT">Aluno</option><option value="TEACHER">Professor</option><option value="ADMIN">Admin</option><option value="STAFF">Equipe escolar</option><option value="GUARDIAN">Responsável</option>
                                    </select>
                                ) : <span className={`admin-role-badge ${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span>}
                            </td>
                            <td><span className={`admin-access-badge ${user.accessBlocked ? 'blocked' : 'active'}`} title={user.accessBlockedReason || undefined}>{user.accessBlocked ? 'Bloqueado' : 'Ativo'}</span></td>
                            <td><div className="admin-user-actions">
                                {editingUserId === user.id ? (
                                    <>
                                        <button onClick={() => void onSaveUser(user)} className="admin-btn-icon" style={{ color: '#22c55e' }} title="Salvar"><Save size={18} /></button>
                                        <button onClick={onCancelEdit} className="admin-btn-icon" title="Cancelar"><X size={18} /></button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => onStartEdit(user)} className="admin-btn-icon" title="Editar dados"><Edit3 size={18} /></button>
                                        {user.id !== currentUserId && (
                                            <>
                                                <button onClick={() => onOpenSecurity('password', user)} className="admin-btn-icon primary" title="Redefinir senha sem apagar dados"><LockKeyhole size={18} /></button>
                                                <button onClick={() => onRequestConfirmation(`Revogar todas as sessões de "${user.name}"? A pessoa precisará entrar novamente.`, () => void onRevokeSessions(user))} className="admin-btn-icon" title="Revogar sessões"><LogOut size={18} /></button>
                                                {user.accessBlocked
                                                    ? <button onClick={() => onRequestConfirmation(`Liberar novamente o acesso de "${user.name}"?`, () => void onUnblockUser(user))} className="admin-btn-icon primary" title="Liberar acesso"><UserCheck size={18} /></button>
                                                    : <button onClick={() => onOpenSecurity('block', user)} className="admin-btn-icon danger" title="Bloquear acesso e revogar sessões"><UserX size={18} /></button>}
                                                <button onClick={() => onRequestConfirmation(`Remover "${user.name}"? Esta ação apaga os dados relacionados e deve ser usada somente quando exigido.`, () => void onDeleteUser(user.id))} className="admin-btn-icon danger" title="Excluir definitivamente"><Trash2 size={18} /></button>
                                            </>
                                        )}
                                    </>
                                )}
                            </div></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                    <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>← Anterior</button>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
                    <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="admin-btn" style={{ padding: '0.4rem 1rem' }}>Próxima →</button>
                </div>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => void onExport()} className="admin-btn-primary" style={{ gap: '0.5rem' }}><Download size={16} /> Exportar Alunos (Excel)</button>
            </div>
        </div>
    );
}
