/**
 * uploadMiddleware.ts — Middleware de Upload de Vídeo (Multer)
 *
 * Configuração:
 * - Destino: VIDEO_STORAGE_PATH (padrão: ./uploads/videos)
 * - Nomes únicos: UUID + extensão original para evitar conflitos
 * - Filtro: Aceita apenas arquivos com mimetype video/*
 * - Limite: 500MB por arquivo
 */
import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, process.env.VIDEO_STORAGE_PATH || './uploads/videos');
    },
    filename: (_req, file, cb) => {
        // Generate unique filename to prevent overrides
        const uniqueSuffix = uuidv4() + path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix);
    }
});

// ISSUE-12: Tipagem correta (não usa `any`)
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Only accept video files
    if (file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Formato de arquivo não suportado. Envie apenas vídeos.'));
    }
};

export const uploadVideo = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        // ISSUE-11: Limite reduzido para 500MB (mais realista para a maioria dos servidores)
        fileSize: 1024 * 1024 * 500
    }
});
