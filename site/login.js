import { apiJson } from './js/api-client.js';
import './js/client-guard.js';
import { setButtonContent } from './js/dom.js';

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('toggle-password');
const errorAlert = document.getElementById('error-alert');
const errorText = document.getElementById('error-text');
const submitButton = document.getElementById('submit-btn');

function togglePasswordVisibility() {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    togglePassword.classList.toggle('fa-eye', !visible);
    togglePassword.classList.toggle('fa-eye-slash', visible);
}

togglePassword.addEventListener('click', togglePasswordVisibility);
togglePassword.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    togglePasswordVisibility();
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorAlert.classList.add('hidden');
    submitButton.disabled = true;
    setButtonContent(submitButton, 'fa-solid fa-spinner fa-spin', 'Entrando...');

    try {
        const session = await apiJson('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value }),
        }, { redirectOnUnauthorized: false });
        window.location.replace(session.user?.role === 'teacher' ? 'professor.html' : 'admin.html');
    } catch (error) {
        errorText.textContent = error.message || 'Não foi possível entrar.';
        errorAlert.classList.remove('hidden');
    } finally {
        submitButton.disabled = false;
        setButtonContent(submitButton, 'fa-solid fa-right-to-bracket', 'Entrar no Painel');
    }
});

if (document.cookie.split('; ').some((value) => value.startsWith('tv_csrf='))) {
    apiJson('/api/auth/session', {}, { redirectOnUnauthorized: false })
        .then((session) => window.location.replace(session.user?.role === 'teacher' ? 'professor.html' : 'admin.html'))
        .catch(() => undefined);
}
