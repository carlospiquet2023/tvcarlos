import { byId, clear, element, icon } from '../dom.js';

export function showToast(title, message = '', type = 'success') {
    const region = byId('toast-region');
    const toast = element('div', { className: `admin-toast ${type}` });
    const copy = element('div');
    copy.append(element('strong', { text: title }), element('span', { text: message }));
    const close = element('button', { title: 'Fechar', attributes: { type: 'button', 'aria-label': 'Fechar aviso' } });
    close.append(icon('fa-solid fa-xmark'));
    close.addEventListener('click', () => toast.remove());
    toast.append(icon(type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-regular fa-circle-check'), copy, close);
    region.append(toast);
    window.setTimeout(() => toast.remove(), type === 'error' ? 7_000 : 4_200);
}

export function setBusy(form, busy) {
    form.setAttribute('aria-busy', String(busy));
    form.querySelectorAll('button, input[type="file"]').forEach((control) => {
        if (busy) {
            control.dataset.disabledBeforeBusy = String(control.disabled);
            control.disabled = true;
        } else {
            control.disabled = control.dataset.disabledBeforeBusy === 'true';
            delete control.dataset.disabledBeforeBusy;
        }
    });
}

export async function confirmRemoval(message) {
    const dialog = byId('confirm-dialog');
    if (!dialog?.showModal) return window.confirm(message);
    byId('confirm-message').textContent = message;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

export function initializeNavigation() {
    const navigate = (view) => {
        const target = document.querySelector(`[data-view="${view}"]`) ? view : 'overview';
        document.querySelectorAll('.admin-view').forEach((section) => section.classList.toggle('active', section.id === `view-${target}`));
        document.querySelectorAll('.admin-nav [data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === target));
        const section = byId(`view-${target}`);
        byId('view-title').textContent = section?.dataset.title || 'Visão geral';
        if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    byId('admin-nav').addEventListener('click', (event) => {
        const link = event.target.closest('[data-view]');
        if (!link) return;
        event.preventDefault();
        navigate(link.dataset.view);
    });
    document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
    window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
    return navigate;
}

export function renderEmpty(container, message) {
    clear(container);
    container.append(element('div', { className: 'admin-empty', text: message }));
}

export function actionButton(iconClass, label, callback, { danger = false, disabled = false } = {}) {
    const button = element('button', { className: `resource-action${danger ? ' delete' : ''}`, title: label, attributes: { type: 'button', 'aria-label': label } });
    button.append(icon(iconClass));
    button.disabled = disabled;
    button.addEventListener('click', callback);
    return button;
}
