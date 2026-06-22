export async function fetchJson(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(withCacheBuster(url), {
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) },
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Requisição ${url} falhou com HTTP ${response.status}.`);
        return await response.json();
    } finally {
        window.clearTimeout(timeout);
    }
}

export function withCacheBuster(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${Date.now()}`;
}
