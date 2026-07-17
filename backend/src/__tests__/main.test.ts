import { describe, expect, it } from 'vitest';
import { shouldRunEmbeddedWorker, validateCriticalEnvironment } from '../main';

describe('validateCriticalEnvironment', () => {
    it('exige JWT_SECRET em todos os ambientes', () => {
        expect(() => validateCriticalEnvironment({ NODE_ENV: 'test' })).toThrow(/JWT_SECRET/);
    });

    it('bloqueia segredo curto em produção', () => {
        expect(() => validateCriticalEnvironment({
            NODE_ENV: 'production',
            JWT_SECRET: 'curto',
        })).toThrow(/JWT_SECRET/);
    });

    it('aceita segredo forte em produção', () => {
        expect(() => validateCriticalEnvironment({
            NODE_ENV: 'production',
            JWT_SECRET: 'uma-chave-com-mais-de-trinta-e-dois-caracteres',
        })).not.toThrow();
    });
});

describe('worker process policy', () => {
    it('keeps the development convenience default', () => {
        expect(shouldRunEmbeddedWorker({ NODE_ENV: 'development' })).toBe(true);
    });

    it('allows Compose to disable the embedded worker explicitly', () => {
        expect(shouldRunEmbeddedWorker({ NODE_ENV: 'development', PGBOSS_WORKER: 'false' })).toBe(false);
    });

    it('does not embed a worker in production by default', () => {
        expect(shouldRunEmbeddedWorker({ NODE_ENV: 'production' })).toBe(false);
    });
});
