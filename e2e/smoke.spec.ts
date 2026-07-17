import { expect, test } from '@playwright/test';
import { apiUrl } from './environment';

test.describe('disponibilidade do ambiente', () => {
  test('API responde ao liveness check', async ({ request }) => {
    const response = await request.get(apiUrl('/health/live'));

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ status: 'ok' }));
  });

  test('frontend carrega a tela de autenticação', async ({ page }) => {
    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Entrar na Plataforma' })).toBeVisible();
    await expect(page.getByPlaceholder('Usuário ou E-mail')).toBeVisible();
    await expect(page.getByPlaceholder('Senha de Acesso')).toBeVisible();
  });
});
