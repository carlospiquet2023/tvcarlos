/** Bootstrap do processo: configuração, socket HTTP, worker e shutdown. */
import 'dotenv/config';
import type { Server } from 'http';
import { createApp, type AppLifecycleState } from './app';
import logger from './lib/logger';
import prisma from './lib/prisma';

export function validateCriticalEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
): void {
    const jwtSecret = environment.JWT_SECRET?.trim();
    if (!jwtSecret) {
        throw new Error('JWT_SECRET ausente ou inseguro para o ambiente atual.');
    }
    if (environment.NODE_ENV === 'production'
        && (jwtSecret.length < 32 || /troque|change|secret-em-producao/i.test(jwtSecret))) {
        throw new Error('JWT_SECRET ausente ou inseguro para o ambiente atual.');
    }
}

type StopBackgroundServices = () => Promise<void>;

export async function startBackgroundServices(): Promise<StopBackgroundServices | undefined> {
    const isWorker = shouldRunEmbeddedWorker(process.env);

    if (isWorker) {
        // Importação tardia mantém a instância HTTP de produção desacoplada do
        // cliente pg-boss. Em desenvolvimento, preserva o worker embutido.
        const worker = await import('./worker');
        await worker.startVideoWorker();
        logger.info('pg-boss worker ativo nesta instância.');
        return worker.stopVideoWorker;
    }

    logger.info('Instância HTTP-only (pg-boss worker desabilitado).');
    return undefined;
}

export function shouldRunEmbeddedWorker(environment: NodeJS.ProcessEnv): boolean {
    const explicit = environment.PGBOSS_WORKER?.trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return environment.NODE_ENV !== 'production';
}

export async function bootstrap(): Promise<void> {
    try {
        validateCriticalEnvironment();
    } catch (error) {
        logger.fatal({ error }, 'Configuração crítica inválida. Abortando.');
        process.exitCode = 1;
        return;
    }

    const lifecycle: AppLifecycleState = { shuttingDown: false, startupReady: false };
    const app = createApp({ lifecycle });
    const port = process.env.PORT || 4000;
    let httpServer!: Server;
    let shutdownPromise: Promise<void> | undefined;
    let stopBackgroundServices: StopBackgroundServices | undefined;

    const shutdown = (signal: string, exitCode = 0): Promise<void> => {
        if (shutdownPromise) return shutdownPromise;
        lifecycle.shuttingDown = true;
        logger.info({ signal }, 'Encerrando graciosamente...');

        shutdownPromise = performShutdown(httpServer, signal, stopBackgroundServices)
            .finally(() => {
                process.exitCode = exitCode;
            });
        return shutdownPromise;
    };

    httpServer = app.listen(port, () => {
        logger.info({ port, pid: process.pid }, 'Server started');

        void startBackgroundServices()
            .then((stop) => {
                stopBackgroundServices = stop;
                if (lifecycle.shuttingDown) {
                    void stop?.();
                    return;
                }
                lifecycle.startupReady = true;
            })
            .catch((error) => {
                logger.fatal({ error }, 'Falha ao iniciar serviços de background');
                void shutdown('STARTUP_FAILURE', 1);
            });
    });

    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.once('SIGINT', () => { void shutdown('SIGINT'); });
    process.once('uncaughtException', (error) => {
        logger.fatal({ error }, 'Exceção não capturada');
        void shutdown('UNCAUGHT_EXCEPTION', 1);
    });
    process.once('unhandledRejection', (reason) => {
        logger.fatal({ reason }, 'Promise rejeitada sem tratamento');
        void shutdown('UNHANDLED_REJECTION', 1);
    });
}

async function performShutdown(
    httpServer: Server,
    signal: string,
    stopBackgroundServices?: StopBackgroundServices,
): Promise<void> {
    const forceExit = setTimeout(() => {
        logger.fatal({ signal }, 'Timeout no encerramento gracioso');
        process.exit(1);
    }, 35_000);
    forceExit.unref();

    try {
        httpServer.closeIdleConnections?.();
        const httpClosed = new Promise<void>((resolve) => {
            httpServer.close((error) => {
                if (error) logger.error({ error }, 'Erro ao fechar servidor HTTP');
                resolve();
            });
        });

        const results = await Promise.allSettled([
            httpClosed,
            stopBackgroundServices?.() ?? Promise.resolve(),
            prisma.$disconnect(),
        ]);
        for (const result of results) {
            if (result.status === 'rejected') {
                logger.error({ error: result.reason }, 'Falha durante shutdown');
            }
        }
    } catch (error) {
        logger.error({ error }, 'Erro durante shutdown');
    } finally {
        clearTimeout(forceExit);
    }
}

if (require.main === module) {
    void bootstrap();
}
