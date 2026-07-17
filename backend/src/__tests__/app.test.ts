import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, jsonBodyLimit, trustProxySetting, type AppLifecycleState } from '../app';

const openServers: Server[] = [];

afterEach(async () => {
    await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => {
        server.close(() => resolve());
    })));
});

describe('createApp', () => {
    it('cria a aplicação sem iniciar listen automaticamente', () => {
        const app = createApp({ createStorageDirectories: false });

        expect(app).toBeTypeOf('function');
        expect(app.get('trust proxy fn')).toBeTypeOf('function');
        expect(openServers).toHaveLength(0);
    });

    it('expõe liveness sem depender de banco ou worker', async () => {
        const response = await request(createTestApp());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: 'ok' });
    });

    it('reflete o ciclo de vida no readiness sem consultar o banco durante startup', async () => {
        const lifecycle: AppLifecycleState = { shuttingDown: false, startupReady: false };
        const queryRaw = vi.fn();
        const app = createTestApp(lifecycle, queryRaw);

        const starting = await request(app, '/health/ready');
        expect(starting.status).toBe(503);
        await expect(starting.json()).resolves.toEqual({ status: 'starting' });
        expect(queryRaw).not.toHaveBeenCalled();

        lifecycle.shuttingDown = true;
        const stopping = await request(app, '/health/ready');
        expect(stopping.status).toBe(503);
        await expect(stopping.json()).resolves.toEqual({ status: 'shutting-down' });
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it('só declara ready depois de validar a conexão com o banco', async () => {
        const lifecycle: AppLifecycleState = { shuttingDown: false, startupReady: true };
        const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

        const response = await request(createTestApp(lifecycle, queryRaw), '/health/ready');

        expect(response.status).toBe(200);
        expect(queryRaw).toHaveBeenCalledOnce();
        await expect(response.json()).resolves.toMatchObject({ status: 'ready' });
    });
});

describe('configuração HTTP', () => {
    it.each([
        [undefined, false],
        ['false', false],
        ['0', false],
        ['true', true],
        ['2', 2],
    ])('interpreta TRUST_PROXY=%s', (input, expected) => {
        expect(trustProxySetting(input)).toBe(expected);
    });

    it('rejeita TRUST_PROXY ambíguo', () => {
        expect(() => trustProxySetting('public')).toThrow(/TRUST_PROXY invalido/);
    });

    it.each([
        [undefined, '2mb'],
        ['64kb', '64kb'],
        ['10MB', '10mb'],
        ['0mb', '2mb'],
    ])('normaliza JSON_BODY_LIMIT=%s', (input, expected) => {
        expect(jsonBodyLimit(input)).toBe(expected);
    });
});

function createTestApp(
    lifecycle: AppLifecycleState = { shuttingDown: false, startupReady: true },
    queryRaw = vi.fn().mockResolvedValue([]),
) {
    const database = {
        $queryRaw: queryRaw,
        module: { findFirst: vi.fn() },
        course: { findFirst: vi.fn() },
    };
    return createApp({
        lifecycle,
        createStorageDirectories: false,
        requestLogging: false,
        database: database as never,
    });
}

async function request(app: ReturnType<typeof createApp>, pathname = '/health/live'): Promise<Response> {
    const server = app.listen(0);
    openServers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${port}${pathname}`);
}
