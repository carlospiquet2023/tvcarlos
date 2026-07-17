#!/usr/bin/env node

const baseUrl = requiredUrl('STAGING_BASE_URL');
const apiUrl = requiredUrl('STAGING_API_URL');
const timeoutMs = positiveInteger(process.env.SMOKE_TIMEOUT_MS, 10_000);
const attempts = positiveInteger(process.env.SMOKE_ATTEMPTS, 3);
const requireBroadcast = process.env.SMOKE_REQUIRE_BROADCAST_AVAILABLE !== 'false';

assertTransport(baseUrl, 'STAGING_BASE_URL');
assertTransport(apiUrl, 'STAGING_API_URL');

const checks = [
    {
        name: 'frontend',
        url: resolvePath(baseUrl, '/'),
        validate: async (response) => {
            const contentType = response.headers.get('content-type') ?? '';
            if (!contentType.toLowerCase().includes('text/html')) {
                throw new Error(`expected text/html, received ${contentType || 'no content-type'}`);
            }
            const body = await response.text();
            if (!/<html[\s>]/i.test(body) || !/<div\s+id=["']root["']/i.test(body)) {
                throw new Error('frontend shell is incomplete');
            }
        },
    },
    {
        name: 'api liveness',
        url: resolvePath(apiUrl, '/health/live'),
        validate: jsonField('status', 'ok'),
    },
    {
        name: 'api readiness',
        url: resolvePath(apiUrl, '/health/ready'),
        validate: jsonField('status', 'ready'),
    },
    {
        name: 'broadcast status',
        url: resolvePath(baseUrl, '/api/broadcast/status'),
        validate: async (response) => {
            const body = await readJson(response);
            if (typeof body.available !== 'boolean' || typeof body.live !== 'boolean' || typeof body.loop !== 'boolean') {
                throw new Error('broadcast response does not match the public status contract');
            }
            if (requireBroadcast && !body.available) {
                throw new Error(`broadcast is unavailable (source=${String(body.source ?? 'unknown')})`);
            }
        },
    },
];

const startedAt = Date.now();
for (const check of checks) {
    await withRetries(check.name, attempts, async () => {
        const response = await fetch(check.url, {
            redirect: 'follow',
            headers: {
                accept: check.name === 'frontend' ? 'text/html' : 'application/json',
                'user-agent': 'eduvault-staging-smoke/1.0',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
        }
        await check.validate(response);
    });
    console.log(`PASS ${check.name}: ${redactedLocation(check.url)}`);
}

console.log(`Staging smoke passed: ${checks.length} checks in ${Date.now() - startedAt}ms.`);

function requiredUrl(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    try {
        return new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute URL.`);
    }
}

function assertTransport(url, name) {
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    const allowHttp = process.env.SMOKE_ALLOW_HTTP === 'true' || localHosts.has(url.hostname);
    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
        throw new Error(`${name} must use HTTPS (set SMOKE_ALLOW_HTTP=true only for controlled environments).`);
    }
    if (url.username || url.password) {
        throw new Error(`${name} must not contain credentials.`);
    }
}

function resolvePath(origin, pathname) {
    const url = new URL(origin);
    url.pathname = pathname;
    url.search = '';
    url.hash = '';
    return url;
}

function positiveInteger(value, fallback) {
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`);
    return parsed;
}

function jsonField(field, expected) {
    return async (response) => {
        const body = await readJson(response);
        if (body[field] !== expected) throw new Error(`expected ${field}=${expected}`);
    };
}

async function readJson(response) {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`expected application/json, received ${contentType || 'no content-type'}`);
    }
    try {
        return await response.json();
    } catch {
        throw new Error('response is not valid JSON');
    }
}

async function withRetries(name, totalAttempts, operation) {
    let lastError;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            await operation();
            return;
        } catch (error) {
            lastError = error;
            if (attempt < totalAttempts) {
                const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 5_000);
                console.warn(`RETRY ${name} (${attempt}/${totalAttempts}): ${error.message}`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    throw new Error(`FAIL ${name}: ${lastError?.message ?? 'unknown error'}`);
}

function redactedLocation(url) {
    return `${url.protocol}//${url.host}${url.pathname}`;
}
