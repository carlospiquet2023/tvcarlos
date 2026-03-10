/**
 * k6 Quick Smoke Test — EduVault
 *
 * Teste rápido de sanidade: 5 VUs por 15 segundos.
 * Use ANTES de cada deploy para validar que nada quebrou.
 *
 * EXECUÇÃO:
 *   k6 run k6/smoke-test.js
 *   k6 run -e BASE_URL=https://seudominio.com.br k6/smoke-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
    vus: 5,
    duration: '15s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    // Health Check
    const health = http.get(`${BASE_URL}/`);
    check(health, {
        'health 200': (r) => r.status === 200,
    });

    // Config público (sem auth)
    const config = http.get(`${BASE_URL}/api/config/public`);
    check(config, {
        'config 200': (r) => r.status === 200,
    });

    // Auth sem credenciais (deve retornar 4xx, não 5xx)
    const noAuth = http.get(`${BASE_URL}/api/admin/stats`);
    check(noAuth, {
        'unauth não é 5xx': (r) => r.status < 500,
    });

    sleep(1);
}
