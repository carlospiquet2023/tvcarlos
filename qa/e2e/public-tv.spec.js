import { expect, test } from '@playwright/test';

function capturePageErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return errors;
}

test.describe('Web TV pública', () => {
    test('renderiza o sinal, a grade e a área comercial sem colisões', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.startsWith('mobile'), 'Cenário específico de desktop.');
        const errors = capturePageErrors(page);
        await page.goto('/');
        await expect.poll(() => page.locator('#schedule-list .schedule-item').count()).toBeGreaterThan(0);
        await expect(page.locator('.player-wrapper')).toBeVisible();
        await expect(page.locator('.schedule-card')).toBeVisible();
        await expect(page.locator('#partner-showcase')).toBeVisible();

        const geometry = await page.evaluate(() => {
            const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
            const player = rect('.player-wrapper');
            const partners = rect('#partner-showcase');
            const ticker = rect('.news-ticker-container');
            return {
                ratio: player.width / player.height,
                partnerBottom: partners.bottom,
                tickerTop: ticker.top,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        expect(geometry.ratio).toBeGreaterThan(1.72);
        expect(geometry.ratio).toBeLessThan(1.82);
        expect(geometry.partnerBottom).toBeLessThanOrEqual(geometry.tickerTop + 1);
        expect(geometry.overflow).toBe(0);
        expect(errors).toEqual([]);
    });

    test('mantém carrossel acima do giro e menu funcional no celular', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.startsWith('desktop'), 'Cenário específico de celular.');
        const errors = capturePageErrors(page);
        await page.goto('/');
        await expect(page.locator('#partner-showcase')).toBeVisible();
        await page.locator('#menu-toggle').click();
        await expect(page.locator('#mobile-menu')).toBeVisible();
        await expect(page.locator('#mobile-menu a')).toHaveCount(2);

        const geometry = await page.evaluate(() => {
            const partners = document.querySelector('#partner-showcase').getBoundingClientRect();
            const ticker = document.querySelector('.news-ticker-container').getBoundingClientRect();
            return {
                partnerBottom: partners.bottom,
                tickerTop: ticker.top,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        expect(Math.abs(geometry.partnerBottom - geometry.tickerTop)).toBeLessThanOrEqual(1);
        expect(geometry.overflow).toBe(0);
        expect(errors).toEqual([]);
    });

    test('expõe páginas institucionais sem erro de execução', async ({ page }) => {
        const errors = capturePageErrors(page);
        await page.goto('/noticias.html');
        await expect(page.locator('main')).toBeVisible();
        await page.goto('/legal.html');
        await expect(page.locator('main')).toContainText('Carlos Antonio de Oliveira Piquet');
        expect(errors).toEqual([]);
    });
});
