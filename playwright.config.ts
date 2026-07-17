import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function externalUrl(name: 'E2E_BASE_URL' | 'E2E_API_URL', fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`${name} é obrigatória. Informe uma URL HTTP(S) do ambiente que será validado.`);
  }

  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} deve usar HTTP ou HTTPS.`);
  }
  return parsed.toString().replace(/\/$/, '');
}

const baseURL = externalUrl('E2E_BASE_URL');
const apiURL = externalUrl('E2E_API_URL', baseURL);
const artifactsDir = process.env.E2E_ARTIFACTS_DIR?.trim()
  || join(tmpdir(), 'eduvault-playwright-artifacts');

process.env.E2E_BASE_URL = baseURL;
process.env.E2E_API_URL = apiURL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['line']] : [['list']],
  outputDir: artifactsDir,
  use: {
    baseURL,
    // Traces e vídeos podem capturar o corpo do login. O gate credenciado
    // preserva apenas screenshots, nas quais o input de senha é mascarado.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
