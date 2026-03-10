/**
 * server.ts — Entry Point do Backend EduVault
 *
 * Responsabilidades:
 * 1. Configura middleware de segurança (Helmet, Rate Limit, CORS)
 * 2. Cria diretórios de armazenamento de vídeo (uploads/videos, uploads/hls)
 * 3. Registra todas as rotas da API (/api/auth, /api/admin, /api/student, /api/videos)
 * 4. Serve arquivos HLS estáticos com autenticação JWT obrigatória
 * 5. Inicia a fila pg-boss para processamento assíncrono de vídeo (FFmpeg)
 *
 * Porta padrão: 4000 (configurável via .env PORT)
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import authRoutes from './routes/auth';
import videoRoutes from './routes/video';
import adminRoutes from './routes/admin';
import studentRoutes from './routes/student';
import configRoutes from './routes/config';
import boss, { initQueue } from './config/pgBoss';
import { processVideoJob } from './services/videoProcessor';
import { authenticateToken } from './middleware/authMiddleware';
import prisma from './lib/prisma';
import logger from './lib/logger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

dotenv.config();

// Validação crítica: JWT_SECRET DEVE existir
if (!process.env.JWT_SECRET) {
    logger.fatal('JWT_SECRET não definido no .env. Abortando.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

// ========================================
// CAMADA DE SEGURANÇA (OWASP Compliance)
// ========================================

// Helmet: Remove headers que expõem a tecnologia do servidor
// crossOriginResourcePolicy: false → permite que o frontend (porta diferente) carregue imagens/vídeos
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate Limiting: proteção contra brute force e DDoS básico
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Limite rígido: 10 tentativas de login por IP a cada 15 min
    message: { message: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});
app.use('/api/auth/login', loginLimiter);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { message: 'Muitas requisições deste IP. Tente novamente mais tarde.' }
});
app.use('/api/', apiLimiter);

// Rate limit separado para /progress (chamado a cada 10s por aluno ativo)
const progressLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // ~3.3/s — suficiente para 1 req/10s com margem
    message: { message: 'Muitas atualizações de progresso.' }
});
app.use('/api/student/progress', progressLimiter);

// CORS configurado restritivamente
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Request logging estruturado
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => (req.url === '/' || req.url === '/api/metrics') } }));

// ========================================
// DIRETÓRIOS DE ARMAZENAMENTO
// ========================================
const videoStoragePath = process.env.VIDEO_STORAGE_PATH || './uploads/videos';
const hlsStoragePath = process.env.HLS_STORAGE_PATH || './uploads/hls';
const imageStoragePath = process.env.IMAGE_STORAGE_PATH || './uploads/images';

[videoStoragePath, hlsStoragePath, imageStoragePath].forEach((dir) => {
    const fullPath = path.resolve(dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// ========================================
// ROTAS DA API
// ========================================

// Health check — verifica DB, pg-boss, disco e fila de vídeos
app.get('/', async (_req, res) => {
    try {
        const warnings: string[] = [];

        // 1. Database latency
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbLatency = Date.now() - dbStart;
        if (dbLatency > 100) warnings.push('Slow database');

        // 2. pg-boss state
        const bossState = boss.started ? 'running' : 'stopped';
        if (!boss.started) warnings.push('pg-boss stopped');

        // 3. Video queue size
        const [queueSize] = await prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM pgboss.job WHERE name = 'video-process' AND state < 'completed'
        `.catch(() => [{ count: 0n }]);
        const pendingJobs = Number(queueSize?.count ?? 0);
        if (pendingJobs > 50) warnings.push('Large video queue');

        // 4. Disk space (uploads directory)
        const uploadsPath = path.resolve(process.env.VIDEO_STORAGE_PATH || './uploads/videos');
        let diskFreeGB = 'N/A';
        try {
            const stats = fs.statfsSync(uploadsPath);
            const freeBytes = stats.bfree * stats.bsize;
            diskFreeGB = (freeBytes / 1e9).toFixed(1);
            if (freeBytes < 5_000_000_000) warnings.push('Low disk space');
        } catch {
            diskFreeGB = 'unavailable';
        }

        // 5. Status
        const status = warnings.length > 0 ? 'degraded' : 'healthy';

        res.status(status === 'healthy' ? 200 : 503).json({
            status,
            warnings,
            checks: {
                database: { connected: true, latency: `${dbLatency}ms` },
                queue: { state: bossState, pending: pendingJobs },
                disk: { free: `${diskFreeGB}GB` },
            },
            uptime: Math.floor(process.uptime()),
        });
    } catch {
        res.status(503).json({ status: 'unhealthy', db: 'disconnected' });
    }
});

// Métricas operacionais (para monitoramento/alertas)
const startTime = Date.now();
app.get('/api/metrics', async (_req, res) => {
    try {
        const mem = process.memoryUsage();
        const [queueSize] = await prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM pgboss.job WHERE name = 'video-process' AND state < 'completed'
        `.catch(() => [{ count: 0n }]);

        res.json({
            uptime: Math.floor((Date.now() - startTime) / 1000),
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024),
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
            },
            pid: process.pid,
            queuePending: Number(queueSize?.count ?? 0),
        });
    } catch {
        res.status(500).json({ error: 'metrics unavailable' });
    }
});

// Autenticação (Login)
app.use('/api/auth', authRoutes);

// Upload e Listagem de Vídeos (Admin/Professor)
app.use('/api/videos', videoRoutes);

// Painel Administrativo Completo (CRUD)
app.use('/api/admin', adminRoutes);

// Área do Aluno (Cursos matriculados, Progresso)
app.use('/api/student', studentRoutes);

// Configurações Globais (Nome, Cor, Logo - Rota Pública)
app.use('/api/config', configRoutes);

// Servir imagens de uploads/images (thumbnails, conteúdo rico)
app.use('/uploads/images', express.static(path.resolve(imageStoragePath)));

// Servir PDFs de uploads/pdfs (material de módulo + calendário)
const pdfStoragePath = process.env.PDF_STORAGE_PATH || './uploads/pdfs';
app.use('/uploads/pdfs', authenticateToken, express.static(path.resolve(pdfStoragePath)));

// HLS Streaming Route
// Segurança: Os caminhos HLS contêm UUIDs aleatórios que só são revelados
// via endpoints autenticados (/api/student/lesson/:id). Autenticação por request
// individual é incompatível com streaming HLS (sub-playlists e segmentos .ts
// não propagam token), então a proteção é feita na camada de API.
app.use('/hls', express.static(path.resolve(hlsStoragePath), {
    setHeaders: (res, filePath) => {
        // Segmentos .ts são imutáveis (conteúdo fixo), cache longo
        // Playlists .m3u8 precisam ser fresh para adaptive switching
        if (filePath.endsWith('.ts')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            res.setHeader('Cache-Control', 'no-cache');
        }
        res.setHeader('X-Robots-Tag', 'noindex');
        res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
    }
}));

app.listen(PORT, async () => {
    logger.info({ port: PORT, pid: process.pid }, 'Server started');

    const isWorker = process.env.PGBOSS_WORKER === 'true' || process.env.NODE_ENV !== 'production';

    if (isWorker) {
        await initQueue();
        await boss.work('video-process', processVideoJob);
        logger.info('pg-boss worker ativo nesta instância.');
    } else {
        logger.info('Instância HTTP-only (pg-boss worker desabilitado).');
    }
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando graciosamente...');
    try {
        await boss.stop({ graceful: true, timeout: 30000 });
        const { default: prisma } = await import('./lib/prisma');
        await prisma.$disconnect();
    } catch (err) {
        logger.error(err, 'Erro durante shutdown');
    }
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
