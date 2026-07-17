import { expect, test, type Page } from '@playwright/test';
import { credentialPair, envFlag } from './environment';

const adminCredentials = credentialPair('ADMIN');
const studentCredentials = credentialPair('STUDENT');
const adminRequired = envFlag('E2E_REQUIRE_ADMIN');

async function submitLogin(page: Page, login: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Usuário ou E-mail').fill(login);
  await page.getByPlaceholder('Senha de Acesso').fill(password);

  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.pathname.endsWith('/api/auth/login');
  });
  await page.getByRole('button', { name: 'Entrar na Plataforma' }).click();
  return responsePromise;
}

test.describe('autenticação e sessão', () => {
  test.describe.configure({ mode: 'serial' });

  test('rejeita credenciais inválidas sem revelar a existência do usuário', async ({ page }) => {
    const response = await submitLogin(
      page,
      `e2e-inexistente-${Date.now()}@example.invalid`,
      'SenhaInvalida-123',
    );

    expect(response.status()).toBe(401);
    await expect(page.locator('.error-message')).toHaveText('Credenciais inválidas.');
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
  });

  test('admin entra na área administrativa e encerra a sessão', async ({ page }) => {
    test.skip(!adminCredentials && !adminRequired, 'Credenciais E2E de administrador não configuradas.');
    if (!adminCredentials) {
      throw new Error('O gate exige E2E_ADMIN_LOGIN e E2E_ADMIN_PASSWORD.');
    }

    const loginResponse = await submitLogin(page, adminCredentials.login, adminCredentials.password);
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user?.role).toBe('ADMIN');

    await expect(page).toHaveURL(/\/admin(?:[/?#]|$)/);
    const logoutButton = page.getByRole('button', { name: 'Sair' });
    await expect(logoutButton).toBeVisible();
    await expect(page.getByText('Painel executivo')).toBeVisible();

    const logoutResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname.endsWith('/api/auth/logout');
    });
    await logoutButton.click();
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    expect((await logoutResponsePromise).status()).toBe(204);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
  });

  test('estudante entra no próprio dashboard quando credenciais são fornecidas', async ({ page }) => {
    test.skip(!studentCredentials, 'Credenciais E2E de estudante não configuradas.');
    if (!studentCredentials) return;

    const loginResponse = await submitLogin(page, studentCredentials.login, studentCredentials.password);
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user?.role).toBe('STUDENT');

    await expect(page).toHaveURL(/\/student\/dashboard(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
    await expect(page.getByTitle('Sair')).toBeVisible();
  });
});
