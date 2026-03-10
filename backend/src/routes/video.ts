/**
 * video.ts — Upload e Listagem de Vídeos
 *
 * Endpoints:
 * - POST /upload           → Upload de vídeo (Admin/Teacher), enfileira processamento FFmpeg
 * - GET  /module/:moduleId → Lista vídeos de um módulo (valida enrollment para STUDENT)
 *
 * Fluxo de upload: Multer salva mp4 → cria registro PENDING → pg-boss enfileira → FFmpeg converte HLS
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { uploadVideo } from '../middleware/uploadMiddleware';
import { enqueueVideoProcessing } from '../config/pgBoss';
import prisma from '../lib/prisma';

const router = Router();

// Only ADMIN or TEACHER can upload videos
router.post('/upload',
    authenticateToken,
    requireRole(['ADMIN', 'TEACHER']),
    uploadVideo.single('video'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { title, description, moduleId } = req.body;
            const file = req.file;

            if (!file) {
                res.status(400).json({ message: 'O arquivo de vídeo é obrigatório. req.file está undefined.' });
                return;
            }

            if (!title || !moduleId) {
                res.status(400).json({ message: `Título e ID do módulo são obrigatórios. Recebido: title=${title}, moduleId=${moduleId}` });
                return;
            }

            // TEACHER: verificar acesso ao módulo via enrollment
            if (req.user!.role === 'TEACHER') {
                const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
                if (!mod) { res.status(404).json({ message: 'Módulo não encontrado.' }); return; }
                const enrollment = await prisma.courseEnrollment.findUnique({
                    where: { userId_courseId: { userId: req.user!.id, courseId: mod.courseId } }
                });
                if (enrollment?.enrollmentRole !== 'TEACHER') {
                    res.status(403).json({ message: 'Acesso negado a este módulo.' });
                    return;
                }
            }

            // 1. Criar registro do vídeo no banco com status PENDING
            const video = await prisma.video.create({
                data: {
                    title,
                    description,
                    moduleId,
                    originalUrl: file.path,
                    status: 'PENDING'
                }
            });

            // 2. Colocar na fila do pg-boss
            await enqueueVideoProcessing(video.id, file.path);

            res.status(201).json({
                message: 'Vídeo enviado com sucesso e adicionado à fila de processamento.',
                video
            });
        } catch (error) {
            console.error('Upload Error:', error);
            res.status(500).json({ message: 'Erro ao realizar upload do vídeo.' });
        }
    });

// Listar vídeos de um módulo específico (com verificação de enrollment)
router.get('/module/:moduleId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = req.params.moduleId as string;
        const userId = req.user!.id;
        const userRole = req.user!.role;

        // Admin e Teacher podem acessar qualquer módulo
        if (userRole === 'STUDENT') {
            // Verificar se o aluno está matriculado no curso que contém este módulo
            const moduleWithCourse = await prisma.module.findUnique({
                where: { id: moduleId },
                select: { courseId: true }
            });

            if (!moduleWithCourse) {
                res.status(404).json({ message: 'Módulo não encontrado.' });
                return;
            }

            const enrollment = await prisma.courseEnrollment.findUnique({
                where: { userId_courseId: { userId, courseId: moduleWithCourse.courseId } }
            });

            if (!enrollment) {
                res.status(403).json({ message: 'Acesso negado. Você não está matriculado neste curso.' });
                return;
            }
        }

        const videos = await prisma.video.findMany({
            where: { moduleId },
            orderBy: { order: 'asc' }
        });

        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao listar vídeos.' });
    }
});

export default router;
