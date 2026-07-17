/** Processo dedicado ao consumo da fila de processamento de vídeo. */
import 'dotenv/config';
import boss, { initQueue } from './config/pgBoss';
import logger from './lib/logger';
import prisma from './lib/prisma';
import { processVideoJob } from './services/videoProcessor';

/** Registra o consumidor sem criar servidor HTTP. */
export async function startVideoWorker(): Promise<void> {
    await initQueue();
    await boss.work('video-process', processVideoJob);
}

/** Para uso embutido em desenvolvimento; o processo chamador encerra o Prisma. */
export async function stopVideoWorker(): Promise<void> {
    await boss.stop({ graceful: true, timeout: 30_000 });
}

/**
 * Mantém o ciclo de vida do worker isolado do processo HTTP. A proteção
 * require.main ao final garante que importar este módulo não inicie a fila.
 */
export async function runWorker(): Promise<void> {
    let shutdownPromise: Promise<void> | undefined;

    const shutdown = (signal: string, exitCode = 0): Promise<void> => {
        if (shutdownPromise) return shutdownPromise;
        logger.info({ signal }, 'Encerrando worker graciosamente...');
        shutdownPromise = stopWorkerProcess(signal).finally(() => {
            process.exitCode = exitCode;
        });
        return shutdownPromise;
    };

    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.once('SIGINT', () => { void shutdown('SIGINT'); });
    process.once('uncaughtException', (error) => {
        logger.fatal({ error }, 'Exceção não capturada no worker');
        void shutdown('UNCAUGHT_EXCEPTION', 1);
    });
    process.once('unhandledRejection', (reason) => {
        logger.fatal({ reason }, 'Promise rejeitada sem tratamento no worker');
        void shutdown('UNHANDLED_REJECTION', 1);
    });

    try {
        await startVideoWorker();
        logger.info({ pid: process.pid }, 'Worker pg-boss de vídeo iniciado.');
    } catch (error) {
        logger.fatal({ error }, 'Falha ao iniciar worker pg-boss');
        await shutdown('STARTUP_FAILURE', 1);
    }
}

async function stopWorkerProcess(signal: string): Promise<void> {
    const forceExit = setTimeout(() => {
        logger.fatal({ signal }, 'Timeout no encerramento gracioso do worker');
        process.exit(1);
    }, 35_000);
    forceExit.unref();

    try {
        const results = await Promise.allSettled([
            stopVideoWorker(),
            prisma.$disconnect(),
        ]);
        for (const result of results) {
            if (result.status === 'rejected') {
                logger.error({ error: result.reason }, 'Falha durante shutdown do worker');
            }
        }
    } finally {
        clearTimeout(forceExit);
    }
}

if (require.main === module) {
    void runWorker();
}
