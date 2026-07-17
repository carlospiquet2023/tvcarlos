#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.SECURITY_TARGET_URL || process.env.TARGET_URL || 'http://localhost:3000');
const allowedOrigin = normalizeOrigin(
    process.env.SECURITY_ALLOWED_ORIGIN || process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
);
const disallowedOrigin = process.env.SECURITY_DISALLOWED_ORIGIN || 'https://attacker.invalid';
const timeoutMs = positiveInteger('SECURITY_TIMEOUT_MS', 5_000);
const oversizedBodyBytes = positiveInteger('SECURITY_OVERSIZED_BODY_BYTES', 3 * 1024 * 1024);

const results = [];

async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(new URL(path, `${baseUrl}/`), {
            redirect: 'manual',
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

async function check(name, assertion) {
    try {
        const detail = await assertion();
        results.push({ name, passed: true, detail: detail || 'ok' });
    } catch (error) {
        results.push({
            name,
            passed: false,
            detail: error instanceof Error ? error.message : String(error),
        });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertStatus(response, accepted) {
    assert(
        accepted.includes(response.status),
        `status ${response.status}; esperado ${accepted.join(' ou ')}`,
    );
}

let initialLiveness;
try {
    initialLiveness = await request('/health/live');
    await initialLiveness.arrayBuffer();
} catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Security gate não alcançou ${baseUrl}/health/live: ${detail}`);
    process.exit(2);
}

async function responseSummary(response) {
    const text = await response.text();
    return text.slice(0, 240).replace(/\s+/g, ' ').trim();
}

await check('liveness responde sem autenticação', async () => {
    assertStatus(initialLiveness, [200]);
    return 'HTTP 200';
});

await check('headers defensivos e tecnologia não exposta', async () => {
    const response = initialLiveness;

    const requiredHeaders = {
        'content-security-policy': (value) => value.includes("default-src 'self'"),
        'cross-origin-opener-policy': (value) => value.length > 0,
        'referrer-policy': (value) => value.length > 0,
        'x-content-type-options': (value) => value.toLowerCase() === 'nosniff',
        'x-frame-options': (value) => value.length > 0,
    };

    for (const [name, validate] of Object.entries(requiredHeaders)) {
        const value = response.headers.get(name) || '';
        assert(validate(value), `header ${name} ausente ou inválido`);
    }
    assert(!response.headers.has('x-powered-by'), 'x-powered-by expõe a tecnologia do servidor');
    return `${Object.keys(requiredHeaders).length} headers validados`;
});

await check('CORS autoriza somente a origem configurada', async () => {
    const allowed = await request('/health/live', { headers: { Origin: allowedOrigin } });
    assertStatus(allowed, [200]);
    assert(
        allowed.headers.get('access-control-allow-origin') === allowedOrigin,
        `origem permitida não recebeu ACAO=${allowedOrigin}`,
    );
    assert(
        allowed.headers.get('access-control-allow-credentials') === 'true',
        'CORS com cookies não declarou credenciais',
    );

    const denied = await request('/health/live', { headers: { Origin: disallowedOrigin } });
    assertStatus(denied, [200]);
    const deniedAcao = denied.headers.get('access-control-allow-origin');
    assert(deniedAcao !== disallowedOrigin && deniedAcao !== '*', 'origem não permitida foi refletida ou recebeu wildcard');
    return `permitida=${allowedOrigin}; não permitida não refletida`;
});

await check('preflight CORS limita métodos e headers', async () => {
    const response = await request('/api/auth/logout', {
        method: 'OPTIONS',
        headers: {
            Origin: allowedOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,x-xsrf-token',
        },
    });
    assertStatus(response, [200, 204]);
    assert(response.headers.get('access-control-allow-origin') === allowedOrigin, 'origem ausente no preflight');
    const methods = (response.headers.get('access-control-allow-methods') || '').toUpperCase();
    assert(methods.includes('POST') && !methods.includes('TRACE'), 'métodos do preflight estão incorretos');
    const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert(headers.includes('content-type') && headers.includes('x-xsrf-token'), 'headers necessários ausentes no preflight');
    return `HTTP ${response.status}`;
});

await check('CSRF bloqueia requisição mutável com cookie de sessão sem token', async () => {
    const response = await request('/api/auth/logout', {
        method: 'POST',
        headers: {
            Cookie: 'eduvault_session=security-gate-invalid-session',
            'Content-Type': 'application/json',
            Origin: allowedOrigin,
        },
        body: '{}',
    });
    assertStatus(response, [403]);
    return 'HTTP 403';
});

const protectedEndpoints = [
    '/api/metrics',
    '/api/auth/me',
    '/api/admin/stats',
    '/api/student/my-courses',
];

for (const endpoint of protectedEndpoints) {
    await check(`autenticação protege ${endpoint}`, async () => {
        const response = await request(endpoint);
        assertStatus(response, [401]);
        return 'HTTP 401';
    });
}

await check('login inválido não autentica nem vaza detalhes internos', async () => {
    const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
        body: JSON.stringify({
            email: `security-gate-${Date.now()}@invalid.example`,
            password: 'definitely-not-a-valid-password',
        }),
    });
    assertStatus(response, [400, 401]);
    const summary = await responseSummary(response);
    assert(!/prisma|postgres|stack|node_modules|select\s|syntaxerror/i.test(summary), 'resposta expôs detalhe interno');
    return `HTTP ${response.status}`;
});

await check('JSON malformado é rejeitado sem erro interno', async () => {
    const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
        body: '{"email":',
    });
    assertStatus(response, [400]);
    const summary = await responseSummary(response);
    assert(!/stack|node_modules/i.test(summary), 'resposta expôs stack trace');
    return 'HTTP 400';
});

await check('payload com operador é rejeitado como credencial inválida', async () => {
    const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
        body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }),
    });
    assertStatus(response, [400, 401]);
    const summary = await responseSummary(response);
    assert(!/prisma|postgres|stack|node_modules/i.test(summary), 'resposta expôs detalhe interno');
    return `HTTP ${response.status}`;
});

await check('payload JSON acima do limite é rejeitado', async () => {
    const oversized = JSON.stringify({ email: 'a'.repeat(oversizedBodyBytes), password: 'invalid' });
    const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
        body: oversized,
    });
    assertStatus(response, [413]);
    return 'HTTP 413';
});

const passed = results.filter((result) => result.passed).length;
const failed = results.length - passed;

console.log(`\nSecurity gate: ${baseUrl}`);
for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name} (${result.detail})`);
}
console.log(`\nResultado: ${passed}/${results.length} aprovados; ${failed} falha(s).`);
console.log('Escopo: smoke test dinâmico de controles HTTP; não substitui pentest independente.');

process.exitCode = failed === 0 ? 0 : 1;

function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`SECURITY_TARGET_URL inválida: ${value}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('SECURITY_TARGET_URL deve usar HTTP ou HTTPS');
    }
    return url.href.replace(/\/$/, '');
}

function normalizeOrigin(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`SECURITY_ALLOWED_ORIGIN inválida: ${value}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('SECURITY_ALLOWED_ORIGIN deve usar HTTP ou HTTPS');
    }
    return url.origin;
}

function positiveInteger(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} deve ser inteiro positivo`);
    return value;
}
