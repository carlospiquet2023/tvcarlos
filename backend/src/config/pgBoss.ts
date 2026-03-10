/**
 * pgBoss.ts — Fila de Background Jobs (Processamento de Vídeo)
 *
 * Exporta:
 * - initQueue():              Inicia o pg-boss e registra listener de erro
 * - enqueueVideoProcessing(): Enfileira um job de conversão mp4 → HLS
 * - default (boss):           Instância do pg-boss para uso no server.ts
 *
 * Usa DATABASE_URL do .env para conectar diretamente ao PostgreSQL
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import dotenv from 'dotenv';
import logger from '../lib/logger';
dotenv.config();

const { PgBoss } = require('pg-boss');

const connectionString = process.env.DATABASE_URL as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const boss: any = new PgBoss(connectionString);

export const initQueue = async () => {
    boss.on('error', (error: Error) => logger.error(error, 'pg-boss error'));

    await boss.start();
    try {
        await boss.createQueue('video-process');
    } catch {
        // Queue já existe — normal em restarts
    }
    logger.info('Fila de processamento (pg-boss) iniciada.');
};

export const enqueueVideoProcessing = async (videoId: string, filePath: string) => {
    await boss.send('video-process', { videoId, filePath });
};

export default boss;
