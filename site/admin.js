import { apiJson } from './js/api-client.js';
import { byId } from './js/dom.js';
import './js/client-guard.js';
import { createBrandingAdminController } from './js/admin/branding-controller.js';
import { adminState } from './js/admin/core.js';
import { createOperationsController } from './js/admin/operations-controller.js';
import { createResourceController } from './js/admin/resource-controller.js';
import { createSecurityController } from './js/admin/security-controller.js';
import { initializeNavigation, showToast } from './js/admin/ui.js';

const operations = createOperationsController();
const navigate = initializeNavigation();
const resources = createResourceController({ navigate, onMutation: operations.loadAudit });
const branding = createBrandingAdminController({ onMutation: operations.loadAudit });
const security = createSecurityController();
let statusTimer;

async function refreshAll(showFeedback = false) {
    const buttonIcon = byId('refresh-admin-btn').querySelector('i');
    buttonIcon.classList.add('fa-spin');
    try {
        await Promise.all([resources.loadAll(), branding.load(), operations.loadAudit(), operations.checkStatus()]);
        byId('last-sync').textContent = `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date())}`;
        if (showFeedback) showToast('Painel atualizado', 'Dados sincronizados com a TV pública.');
    } catch (error) {
        showToast('Falha ao atualizar o painel', error.message, 'error');
    } finally {
        buttonIcon.classList.remove('fa-spin');
    }
}

async function initialize() {
    try {
        adminState.session = await apiJson('/api/auth/session');
        resources.initialize();
        branding.initialize();
        security.initialize();
        security.renderSession();
        bindSessionActions();
        await refreshAll();
        navigate(location.hash.slice(1) || 'overview');
        document.body.classList.remove('auth-loading');
        statusTimer = window.setInterval(operations.checkStatus, 15_000);
    } catch (error) {
        console.error(error);
        location.replace('login.html');
    }
}

function bindSessionActions() {
    byId('refresh-admin-btn').addEventListener('click', () => refreshAll(true));
    byId('logout-btn').addEventListener('click', async () => {
        try { await apiJson('/api/auth/logout', { method: 'POST' }); }
        finally { location.replace('login.html'); }
    });
}

window.addEventListener('pagehide', () => window.clearInterval(statusTimer), { once: true });
initialize();
