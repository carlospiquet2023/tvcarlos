import { expect, test } from '@playwright/test';

const username = process.env.ADMIN_INITIAL_USERNAME;
const password = process.env.ADMIN_INITIAL_PASSWORD;

test.describe('Central administrativa', () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(!username || !password, 'Credenciais E2E não foram fornecidas.');

    test('autentica e carrega todos os módulos operacionais', async ({ page }, testInfo) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });

        await page.goto('/login.html');
        await page.getByLabel('Usuário').fill(username);
        await page.locator('#password').fill(password);
        await page.getByRole('button', { name: /entrar/i }).click();
        await expect(page).toHaveURL(/admin\.html/, { timeout: 20_000 });
        await expect(page.locator('body')).not.toHaveClass(/auth-loading/);
        await expect(page.locator('#stat-programs')).not.toHaveText('0', { timeout: 10_000 });
        await expect(page.locator('#branding-form')).toBeAttached();
        await expect(page.locator('#add-header-link-form')).toBeAttached();
        await expect(page.locator('#add-program-form')).toBeAttached();
        await expect(page.locator('#add-news-form')).toBeAttached();
        await expect(page.locator('#add-partner-form')).toBeAttached();
        if (testInfo.project.name.startsWith('mobile')) {
            await expect(page.locator('.admin-sidebar')).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBe(0);
        }
        expect(errors).toEqual([]);
    });

    test('cria e remove um botão do cabeçalho com persistência', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.startsWith('mobile'), 'Mutação administrativa validada uma vez no desktop.');
        await page.goto('/login.html');
        await page.getByLabel('Usuário').fill(username);
        await page.locator('#password').fill(password);
        await page.getByRole('button', { name: /entrar/i }).click();
        await expect(page).toHaveURL(/admin\.html/, { timeout: 20_000 });
        await page.locator('[data-view="navigation"]').click();
        await expect(page.locator('#view-navigation')).toBeVisible();

        const count = Number((await page.locator('#header-link-list-count').textContent()).match(/\d+/)?.[0] || 0);
        test.skip(count >= 4, 'Instalação já usa os quatro botões disponíveis.');
        const name = `Validação E2E ${Date.now()}`;
        await page.getByLabel('Nome do botão').fill(name.slice(0, 40));
        await page.getByLabel('Destino').fill('https://example.com/validacao-e2e');
        await page.locator('#header-link-submit-btn').click();
        const row = page.locator('#active-header-links-list .resource-row').filter({ hasText: name.slice(0, 40) });
        await expect(row).toBeVisible();

        await row.getByRole('button', { name: 'Remover' }).click();
        await expect(page.locator('#confirm-dialog')).toBeVisible();
        await page.locator('#confirm-action-btn').click();
        await expect(row).toHaveCount(0);
    });
});
