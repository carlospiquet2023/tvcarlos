import { requiredElement } from '../dom.js';

export function createPrivateRoomController() {
    const dialog = requiredElement('private-room-dialog');
    const form = requiredElement('private-room-access-form');
    const code = requiredElement('private-room-code-input');
    const password = requiredElement('private-room-password-input');
    const error = requiredElement('private-room-access-error');
    const submit = requiredElement('private-room-submit');
    const openButtons = [
        requiredElement('private-room-open'),
        requiredElement('mobile-private-room-open'),
    ];

    function initialize() {
        openButtons.forEach((button) => button.addEventListener('click', open));
        requiredElement('private-room-close').addEventListener('click', close);
        dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
        form.addEventListener('submit', submitAccess);
        if (new URLSearchParams(location.search).has('room')) open();
    }

    function open() {
        clearError();
        closeMobileMenu();
        const preset = new URLSearchParams(location.search).get('room');
        if (preset && !code.value) code.value = preset;
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute('open', '');
        window.setTimeout(() => code.focus(), 40);
    }

    function close() {
        if (dialog.close) dialog.close();
        else dialog.removeAttribute('open');
    }

    async function submitAccess(event) {
        event.preventDefault();
        clearError();
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/api/private-room-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ roomCode: code.value.trim(), password: password.value }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.error?.message || 'ID ou senha inválidos.');
            location.assign(payload.url);
        } catch (accessError) {
            error.textContent = accessError.message;
            password.select();
        } finally {
            submit.disabled = false;
            submit.removeAttribute('aria-busy');
        }
    }

    function clearError() {
        error.textContent = '';
    }

    function closeMobileMenu() {
        document.getElementById('mobile-menu')?.classList.add('hidden');
        const toggle = document.getElementById('menu-toggle');
        toggle?.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
        document.querySelector('.main-header')?.classList.remove('menu-open');
    }

    return { initialize, open, close };
}
