import { apiJson } from '../api-client.js';
import { byId } from '../dom.js';
import { adminState, jsonRequest } from './core.js';
import { setBusy, showToast } from './ui.js';

export function createSecurityController() {
    function initialize() {
        const form = byId('credentials-form');
        const password = byId('new-password-input');
        const confirmation = byId('confirm-password-input');
        const updateRules = () => {
            const longEnough = password.value.length >= 14;
            const matches = password.value.length > 0 && password.value === confirmation.value;
            setRule('rule-length', longEnough);
            setRule('rule-match', matches);
            byId('save-credentials-btn').disabled = !(longEnough && matches);
        };
        password.addEventListener('input', updateRules);
        confirmation.addEventListener('input', updateRules);
        bindPasswordToggle('toggle-new-password', 'new-password-input');
        bindPasswordToggle('toggle-confirm-password', 'confirm-password-input');
        form.addEventListener('submit', saveCredentials);
    }

    function renderSession() {
        const username = adminState.session.user.username;
        const expiry = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(adminState.session.expiresAt));
        byId('sidebar-username').textContent = username;
        byId('new-username-input').value = username;
        byId('security-current-user').textContent = username;
        byId('security-session-expiry').textContent = expiry;
        byId('session-status').textContent = expiry;
    }

    async function saveCredentials(event) {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(form, true);
        try {
            await apiJson('/api/auth/credentials', jsonRequest('PUT', {
                currentPassword: byId('current-password-input').value,
                newUsername: byId('new-username-input').value.trim(),
                newPassword: byId('new-password-input').value,
            }));
            showToast('Credenciais atualizadas', 'Todas as sessões foram encerradas. Entre novamente.');
            window.setTimeout(() => location.replace('login.html'), 1_200);
        } catch (error) {
            showToast('Não foi possível alterar as credenciais', error.message, 'error');
            setBusy(form, false);
        }
    }

    function setRule(id, valid) {
        const rule = byId(id);
        rule.classList.toggle('valid', valid);
        rule.querySelector('i').className = valid ? 'fa-regular fa-circle-check' : 'fa-regular fa-circle';
    }

    function bindPasswordToggle(buttonId, inputId) {
        byId(buttonId).addEventListener('click', () => {
            const input = byId(inputId);
            input.type = input.type === 'password' ? 'text' : 'password';
            byId(buttonId).querySelector('i').className = input.type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }

    return { initialize, renderSession };
}
