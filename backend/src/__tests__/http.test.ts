import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asyncHandler, createErrorHandler, HttpError, notFoundHandler } from '../lib/http';

const openServers: Server[] = [];

afterEach(async () => {
    await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => {
        server.close(() => resolve());
    })));
});

describe('HTTP boundary', () => {
    it('encaminha rejeições assíncronas e expõe somente HttpError seguro', async () => {
        const errorLogger = { error: vi.fn() };
        const app = express();
        app.get('/failure', asyncHandler(async () => {
            throw new HttpError(409, 'Conflito conhecido.', 'KNOWN_CONFLICT');
        }));
        app.use(createErrorHandler(errorLogger));

        const response = await request(app, '/failure');

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            code: 'KNOWN_CONFLICT',
            message: 'Conflito conhecido.',
        });
        expect(errorLogger.error).not.toHaveBeenCalled();
    });

    it('mascara e registra erros internos desconhecidos', async () => {
        const errorLogger = { error: vi.fn() };
        const app = express();
        app.get('/failure', asyncHandler(async () => {
            throw new Error('segredo interno');
        }));
        app.use(createErrorHandler(errorLogger));

        const response = await request(app, '/failure');

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ message: 'Erro interno do servidor.' });
        expect(errorLogger.error).toHaveBeenCalledOnce();
    });

    it('responde misses com JSON determinístico', async () => {
        const app = express();
        app.use(notFoundHandler);

        const response = await request(app, '/missing');

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ message: 'Recurso não encontrado.' });
    });
});

async function request(app: express.Express, pathname: string): Promise<Response> {
    const server = app.listen(0);
    openServers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${port}${pathname}`);
}
