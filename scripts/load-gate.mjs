#!/usr/bin/env node

const config = loadConfig();

console.log('Load gate');
console.log(`Alvo: ${config.method} ${config.url}`);
console.log(`Carga: ${config.requests} requisições, concorrência ${config.concurrency}, warmup ${config.warmupRequests}`);

if (config.warmupRequests > 0) {
    const warmup = await runRequests(config.warmupRequests, Math.min(config.concurrency, config.warmupRequests));
    const warmupErrors = warmup.filter((sample) => !sample.ok).length;
    if (warmupErrors > 0) {
        console.error(`Warmup falhou: ${warmupErrors}/${warmup.length} requisições sem sucesso.`);
        printFailureSamples(warmup);
        process.exit(1);
    }
}

const startedAt = performance.now();
const samples = await runRequests(config.requests, Math.min(config.concurrency, config.requests));
const durationMs = performance.now() - startedAt;
const report = summarize(samples, durationMs);
const failures = evaluate(report);

console.log('\nMétricas');
console.log(`Duração:       ${formatMs(report.durationMs)}`);
console.log(`Throughput:    ${report.requestsPerSecond.toFixed(2)} req/s`);
console.log(`Latência p50:  ${formatMs(report.p50Ms)}`);
console.log(`Latência p95:  ${formatMs(report.p95Ms)} (limite ${formatMs(config.maxP95Ms)})`);
console.log(`Latência p99:  ${formatMs(report.p99Ms)}`);
console.log(`Erros totais:  ${report.errorCount}/${report.total} (${formatPercent(report.errorRatePercent)}; limite ${formatPercent(config.maxErrorRatePercent)})`);
console.log(`Erros HTTP 5xx:${report.serverErrorCount}/${report.total} (${formatPercent(report.serverErrorRatePercent)}; limite ${formatPercent(config.maxServerErrorRatePercent)})`);
console.log(`Status HTTP:   ${formatStatuses(report.statuses)}`);

if (failures.length > 0) {
    console.error('\nFAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    printFailureSamples(samples);
    process.exitCode = 1;
} else {
    console.log('\nPASS: limiares de carga atendidos.');
}

async function runRequests(count, concurrency) {
    const samples = new Array(count);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const index = nextIndex++;
            if (index >= count) return;
            samples[index] = await singleRequest();
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return samples;
}

async function singleRequest() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = performance.now();

    try {
        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: config.body,
            redirect: 'manual',
            signal: controller.signal,
        });
        await response.arrayBuffer();
        const latencyMs = performance.now() - startedAt;
        const expected = config.expectedStatuses(response.status);
        return {
            ok: expected,
            latencyMs,
            status: response.status,
            error: expected ? undefined : `status HTTP inesperado: ${response.status}`,
        };
    } catch (error) {
        return {
            ok: false,
            latencyMs: performance.now() - startedAt,
            status: 0,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        clearTimeout(timer);
    }
}

function summarize(samples, durationMs) {
    const latencies = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const statuses = new Map();
    let errorCount = 0;
    let serverErrorCount = 0;

    for (const sample of samples) {
        const label = sample.status === 0 ? 'transport' : String(sample.status);
        statuses.set(label, (statuses.get(label) || 0) + 1);
        if (!sample.ok) errorCount += 1;
        if (sample.status >= 500 && sample.status <= 599) serverErrorCount += 1;
    }

    return {
        total: samples.length,
        durationMs,
        requestsPerSecond: samples.length / (durationMs / 1_000),
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        errorCount,
        errorRatePercent: (errorCount / samples.length) * 100,
        serverErrorCount,
        serverErrorRatePercent: (serverErrorCount / samples.length) * 100,
        statuses,
    };
}

function evaluate(report) {
    const failures = [];
    if (report.p95Ms >= config.maxP95Ms) {
        failures.push(`p95 ${formatMs(report.p95Ms)} não ficou abaixo de ${formatMs(config.maxP95Ms)}`);
    }
    if (report.errorRatePercent > config.maxErrorRatePercent) {
        failures.push(`erros totais ${formatPercent(report.errorRatePercent)} excederam ${formatPercent(config.maxErrorRatePercent)}`);
    }
    if (report.serverErrorRatePercent >= config.maxServerErrorRatePercent) {
        failures.push(`erros 5xx ${formatPercent(report.serverErrorRatePercent)} não ficaram abaixo de ${formatPercent(config.maxServerErrorRatePercent)}`);
    }
    return failures;
}

function percentile(sortedValues, percentileValue) {
    if (sortedValues.length === 0) return 0;
    const index = Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1);
    return sortedValues[index];
}

function loadConfig() {
    const baseUrl = normalizeUrl(process.env.LOAD_TARGET_URL || process.env.TARGET_URL || 'http://localhost:3000');
    const path = process.env.LOAD_PATH || '/health/live';
    const method = (process.env.LOAD_METHOD || 'GET').toUpperCase();
    const writeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const body = process.env.LOAD_BODY;
    const headers = { Accept: 'application/json' };

    if (process.env.LOAD_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.LOAD_AUTH_TOKEN}`;
    if (process.env.LOAD_COOKIE) headers.Cookie = process.env.LOAD_COOKIE;
    if (process.env.LOAD_CSRF_TOKEN) headers['X-XSRF-TOKEN'] = process.env.LOAD_CSRF_TOKEN;
    if (body !== undefined) headers['Content-Type'] = process.env.LOAD_CONTENT_TYPE || 'application/json';

    return {
        url: new URL(path, `${baseUrl}/`).href,
        method,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        headers,
        warmupRequests: nonNegativeInteger('LOAD_WARMUP_REQUESTS', 20),
        requests: positiveInteger('LOAD_REQUESTS', 500),
        concurrency: positiveInteger('LOAD_CONCURRENCY', 20),
        timeoutMs: positiveInteger('LOAD_TIMEOUT_MS', 5_000),
        maxP95Ms: positiveNumber('LOAD_MAX_P95_MS', writeMethod ? 750 : 500),
        maxErrorRatePercent: nonNegativeNumber('LOAD_MAX_ERROR_RATE_PERCENT', 0.5),
        maxServerErrorRatePercent: nonNegativeNumber('LOAD_MAX_5XX_RATE_PERCENT', 0.5),
        expectedStatuses: statusMatcher(process.env.LOAD_EXPECTED_STATUS || '200-399'),
    };
}

function statusMatcher(specification) {
    const ranges = specification.split(',').map((part) => {
        const match = part.trim().match(/^(\d{3})(?:-(\d{3}))?$/);
        if (!match) throw new Error(`LOAD_EXPECTED_STATUS inválido: ${specification}`);
        const start = Number(match[1]);
        const end = Number(match[2] || match[1]);
        if (start > end || start < 100 || end > 599) {
            throw new Error(`LOAD_EXPECTED_STATUS inválido: ${specification}`);
        }
        return [start, end];
    });
    return (status) => ranges.some(([start, end]) => status >= start && status <= end);
}

function printFailureSamples(samples) {
    const examples = samples.filter((sample) => !sample.ok).slice(0, 5);
    if (examples.length === 0) return;
    console.error('Exemplos de falha:');
    for (const sample of examples) {
        console.error(`- ${sample.status || 'transporte'} em ${formatMs(sample.latencyMs)}: ${sample.error}`);
    }
}

function formatStatuses(statuses) {
    return [...statuses.entries()].map(([status, count]) => `${status}=${count}`).join(', ') || 'nenhum';
}

function formatMs(value) {
    return `${value.toFixed(1)} ms`;
}

function formatPercent(value) {
    return `${value.toFixed(3)}%`;
}

function normalizeUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`LOAD_TARGET_URL inválida: ${value}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LOAD_TARGET_URL deve usar HTTP ou HTTPS');
    return url.href.replace(/\/$/, '');
}

function positiveInteger(name, fallback) {
    const value = readNumber(name, fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} deve ser inteiro positivo`);
    return value;
}

function nonNegativeInteger(name, fallback) {
    const value = readNumber(name, fallback);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} deve ser inteiro não negativo`);
    return value;
}

function positiveNumber(name, fallback) {
    const value = readNumber(name, fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} deve ser número positivo`);
    return value;
}

function nonNegativeNumber(name, fallback) {
    const value = readNumber(name, fallback);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} deve ser número não negativo`);
    return value;
}

function readNumber(name, fallback) {
    const raw = process.env[name];
    return raw === undefined || raw === '' ? fallback : Number(raw);
}
