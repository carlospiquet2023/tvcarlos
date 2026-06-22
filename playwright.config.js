import { defineConfig, devices } from '@playwright/test';
import { loadEnvFile } from 'node:process';

try {
    loadEnvFile('.env');
} catch {
    // CI and production may inject environment variables without a local file.
}

export default defineConfig({
    testDir: './qa/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    expect: { timeout: 8_000 },
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:8082',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    ],
});
