import { afterEach, describe, expect, it } from 'vitest';
import { getEmailConfigurationStatus, isEmailConfigured } from '../lib/email';

const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE'] as const;
const originalValues = Object.fromEntries(smtpKeys.map(key => [key, process.env[key]]));

afterEach(() => {
    for (const key of smtpKeys) {
        const original = originalValues[key];
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
    }
});

describe('email configuration status', () => {
    it('reports missing SMTP secrets without exposing their values', () => {
        for (const key of smtpKeys) delete process.env[key];

        const status = getEmailConfigurationStatus();

        expect(status.configured).toBe(false);
        expect(status.missing).toEqual(expect.arrayContaining(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']));
        expect(status).not.toHaveProperty('user');
        expect(status).not.toHaveProperty('pass');
        expect(isEmailConfigured()).toBe(false);
    });

    it('recognizes a complete SMTP configuration', () => {
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_USER = 'mailer@example.com';
        process.env.SMTP_PASS = 'secret-value';
        process.env.SMTP_FROM = 'Escola <mailer@example.com>';
        process.env.SMTP_SECURE = 'false';

        expect(getEmailConfigurationStatus()).toMatchObject({
            configured: true,
            missing: [],
            host: 'smtp.example.com',
            port: 587,
            secure: false
        });
        expect(isEmailConfigured()).toBe(true);
    });
});
