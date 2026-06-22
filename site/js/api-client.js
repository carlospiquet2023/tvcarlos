const CSRF_COOKIE = 'tv_csrf';

export class ApiError extends Error {
    constructor(message, status, code = 'REQUEST_FAILED') {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

export async function apiFetch(url, options = {}, { redirectOnUnauthorized = true } = {}) {
    const headers = new Headers(options.headers || {});
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrf = readCookie(CSRF_COOKIE);
        if (csrf) headers.set('X-CSRF-Token', csrf);
    }

    const response = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: 'same-origin',
    });

    if (response.status === 401 && redirectOnUnauthorized) {
        window.location.replace('login.html');
        throw new ApiError('Sessão expirada.', 401, 'UNAUTHORIZED');
    }
    return response;
}

export async function apiJson(url, options = {}, behavior) {
    const response = await apiFetch(url, options, behavior);
    if (!response.ok) {
        let payload;
        try { payload = await response.json(); } catch { payload = undefined; }
        throw new ApiError(
            payload?.error?.message || 'A operação não pôde ser concluída.',
            response.status,
            payload?.error?.code,
        );
    }
    return response.status === 204 ? undefined : response.json();
}

function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split('; ').find((value) => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}
