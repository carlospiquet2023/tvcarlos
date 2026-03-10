/**
 * k6 Load Test — EduVault Platform
 *
 * INSTALAÇÃO:
 *   Windows: choco install k6   ou   winget install grafana.k6
 *   Linux:   sudo snap install k6
 *   macOS:   brew install k6
 *
 * EXECUÇÃO:
 *   k6 run k6/load-test.js
 *   k6 run --vus 100 --duration 60s k6/load-test.js     (override rápido)
 *   k6 run --out json=results.json k6/load-test.js       (salvar resultados)
 *
 * CENÁRIOS:
 *   1. smoke     → 5 VUs, 30s (sanidade básica)
 *   2. load      → 100 VUs ramp-up, 5min sustentado (carga normal)
 *   3. stress    → 300 VUs ramp-up, 3min sustentado (limite do sistema)
 *   4. spike     → 0 → 500 VUs em 10s, depois volta (pico repentino)
 *
 * ALTERE as variáveis BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD abaixo.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================
// CONFIGURAÇÃO — ALTERE AQUI
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@eduvault.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Admin123';

// ============================================================
// MÉTRICAS CUSTOMIZADAS
// ============================================================
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const apiDuration = new Trend('api_duration');

// ============================================================
// CENÁRIOS DE CARGA
// ============================================================
export const options = {
    scenarios: {
        // 1. Smoke Test (sanidade)
        smoke: {
            executor: 'constant-vus',
            vus: 5,
            duration: '30s',
            tags: { scenario: 'smoke' },
            exec: 'studentFlow',
        },

        // 2. Load Test (carga normal — 100 alunos simultâneos)
        load: {
            executor: 'ramping-vus',
            startTime: '35s',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 50 },    // ramp-up
                { duration: '3m', target: 100 },   // sustentado
                { duration: '1m', target: 0 },     // ramp-down
            ],
            tags: { scenario: 'load' },
            exec: 'studentFlow',
        },

        // 3. Stress Test (limite — 300 alunos)
        stress: {
            executor: 'ramping-vus',
            startTime: '6m',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 150 },
                { duration: '2m', target: 300 },
                { duration: '1m', target: 0 },
            ],
            tags: { scenario: 'stress' },
            exec: 'studentFlow',
        },

        // 4. Spike Test (pico repentino)
        spike: {
            executor: 'ramping-vus',
            startTime: '10m',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 500 },  // SPIKE!
                { duration: '30s', target: 500 },  // sustenta pico
                { duration: '20s', target: 0 },    // normaliza
            ],
            tags: { scenario: 'spike' },
            exec: 'healthCheck',
        },
    },

    thresholds: {
        // SLA: 95% das requests abaixo de 500ms
        http_req_duration: ['p(95)<500', 'p(99)<1500'],
        // Menos de 1% de erro
        errors: ['rate<0.01'],
        // Login abaixo de 1s
        login_duration: ['p(95)<1000'],
        // APIs abaixo de 300ms
        api_duration: ['p(95)<300'],
    },
};

// ============================================================
// FLUXO: Aluno típico (login → cursos → aula → progresso)
// ============================================================
export function studentFlow() {
    let token = null;

    group('01_Login', () => {
        const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
        }), {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'POST /api/auth/login' },
        });

        loginDuration.add(loginRes.timings.duration);

        const success = check(loginRes, {
            'login status 200': (r) => r.status === 200,
            'has token': (r) => {
                try { return JSON.parse(r.body).token !== undefined; }
                catch { return false; }
            },
        });

        errorRate.add(!success);

        if (loginRes.status === 200) {
            try { token = JSON.parse(loginRes.body).token; }
            catch { /* ignore */ }
        }
    });

    if (!token) {
        sleep(1);
        return;
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    sleep(0.5);

    group('02_Dashboard', () => {
        // Buscar cursos
        const coursesRes = http.get(`${BASE_URL}/api/student/my-courses`, {
            headers, tags: { name: 'GET /api/student/my-courses' },
        });
        apiDuration.add(coursesRes.timings.duration);
        const ok = check(coursesRes, { 'courses 200': (r) => r.status === 200 });
        errorRate.add(!ok);

        // Buscar notificações (em paralelo no frontend)
        const notifRes = http.get(`${BASE_URL}/api/student/notifications`, {
            headers, tags: { name: 'GET /api/student/notifications' },
        });
        apiDuration.add(notifRes.timings.duration);
        check(notifRes, { 'notifications 200': (r) => r.status === 200 });

        // Buscar live classes
        const liveRes = http.get(`${BASE_URL}/api/student/my-live-classes`, {
            headers, tags: { name: 'GET /api/student/my-live-classes' },
        });
        apiDuration.add(liveRes.timings.duration);
        check(liveRes, { 'live-classes 200': (r) => r.status === 200 });
    });

    sleep(1);

    group('03_Config_Public', () => {
        const configRes = http.get(`${BASE_URL}/api/config/public`, {
            tags: { name: 'GET /api/config/public' },
        });
        apiDuration.add(configRes.timings.duration);
        const ok = check(configRes, { 'config 200': (r) => r.status === 200 });
        errorRate.add(!ok);
    });

    sleep(1);

    group('04_Forum_Comments', () => {
        // Buscar comentários de uma aula (simula polling do fórum)
        const commentsRes = http.get(`${BASE_URL}/api/student/comments/1`, {
            headers, tags: { name: 'GET /api/student/comments/:videoId' },
        });
        apiDuration.add(commentsRes.timings.duration);
        check(commentsRes, { 'comments 200 or 404': (r) => r.status === 200 || r.status === 404 });

        // Buscar status do fórum do aluno (ban, violações)
        const statusRes = http.get(`${BASE_URL}/api/student/forum/my-status`, {
            headers, tags: { name: 'GET /api/student/forum/my-status' },
        });
        apiDuration.add(statusRes.timings.duration);
        check(statusRes, { 'forum status 200': (r) => r.status === 200 });
    });

    sleep(1);

    group('05_Attendance_Heartbeat', () => {
        // Simula heartbeat de presença (enviado a cada 30s enquanto vídeo toca)
        const heartbeatRes = http.post(`${BASE_URL}/api/student/attendance/heartbeat`, JSON.stringify({
            moduleId: '00000000-0000-0000-0000-000000000001',
        }), {
            headers, tags: { name: 'POST /api/student/attendance/heartbeat' },
        });
        apiDuration.add(heartbeatRes.timings.duration);
        check(heartbeatRes, { 'heartbeat 200 or 400': (r) => r.status === 200 || r.status === 400 });
    });

    sleep(2 + Math.random() * 3); // Simula tempo assistindo vídeo
}

// ============================================================
// FLUXO: Health check (para spike test)
// ============================================================
export function healthCheck() {
    const res = http.get(`${BASE_URL}/`, {
        tags: { name: 'GET / (health)' },
    });
    const ok = check(res, {
        'health 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    sleep(0.1);
}

// ============================================================
// RESUMO CUSTOMIZADO
// ============================================================
export function handleSummary(data) {
    const summary = {
        'Total Requests': data.metrics.http_reqs.values.count,
        'Avg Response Time': `${data.metrics.http_req_duration.values.avg.toFixed(0)}ms`,
        'p95 Response Time': `${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms`,
        'p99 Response Time': `${data.metrics.http_req_duration.values['p(99)'].toFixed(0)}ms`,
        'Error Rate': `${(data.metrics.errors?.values?.rate * 100 || 0).toFixed(2)}%`,
        'Max VUs': data.metrics.vus_max?.values?.max || 'N/A',
    };

    console.log('\n═══════════════════════════════════════');
    console.log('  RESUMO DO TESTE DE CARGA — EDUVAULT');
    console.log('═══════════════════════════════════════');
    Object.entries(summary).forEach(([k, v]) => {
        console.log(`  ${k}: ${v}`);
    });
    console.log('═══════════════════════════════════════\n');

    return {
        stdout: JSON.stringify(summary, null, 2),
    };
}
