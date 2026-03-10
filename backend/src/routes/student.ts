/**
 * student.ts — Área do Aluno (Cursos, Aulas, Progresso)
 *
 * Endpoints:
 * - GET  /my-courses         → Lista cursos matriculados com progresso agregado
 * - GET  /available-courses  → Lista cursos disponíveis (não matriculado)
 * - GET  /lesson/:videoId    → Busca aula individual com conteúdo completo (valida enrollment)
 * - POST /progress           → Salva progresso de visualização (valida enrollment)
 * - GET  /progress/:videoId  → Busca progresso salvo para um vídeo específico
 *
 * Segurança: Todas as rotas validam matrícula antes de retornar dados
 */
import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import prisma from '../lib/prisma';
import { checkProfanity } from '../lib/profanityFilter';

const router = Router();

// ============================================================
// CURSOS MATRICULADOS (com progresso agregado)
// ============================================================
router.get('/my-courses', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        const enrollments = await prisma.courseEnrollment.findMany({
            where: { userId },
            select: {
                course: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        thumbnailUrl: true,
                        modules: {
                            orderBy: { order: 'asc' },
                            select: {
                                id: true,
                                name: true,
                                order: true,
                                videos: {
                                    orderBy: { order: 'asc' },
                                    select: {
                                        id: true,
                                        title: true,
                                        thumbnailUrl: true,
                                        status: true,
                                        order: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // Calcular progresso por curso (batch único — evita N+1)
        const allVideoIds = enrollments.flatMap(e => e.course.modules.flatMap(m => m.videos.map(v => v.id)));

        const allHistories = allVideoIds.length > 0
            ? await prisma.videoHistory.findMany({
                where: { userId, videoId: { in: allVideoIds } }
            })
            : [];

        // Indexar por videoId para lookup O(1)
        const historyMap = new Map(allHistories.map(h => [h.videoId, h]));

        const coursesWithProgress = enrollments.map((e) => {
            const course = e.course;
            const courseVideoIds = course.modules.flatMap(m => m.videos.map(v => v.id));
            const totalVideos = courseVideoIds.length;

            let completedVideos = 0;
            let lastWatchedVideo: { id: string; title: string; thumbnailUrl: string | null; progress: number; moduleName: string } | null = null;
            let lastWatchedAt: Date | null = null;

            if (totalVideos > 0) {
                const courseHistories = courseVideoIds
                    .map(id => historyMap.get(id))
                    .filter((h): h is NonNullable<typeof h> => h != null);

                completedVideos = courseHistories.filter(h => h.completed).length;

                // Encontrar o último vídeo assistido
                if (courseHistories.length > 0) {
                    const sorted = [...courseHistories].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
                    const lastHistory = sorted[0];
                    lastWatchedAt = lastHistory.updatedAt;
                    for (const mod of course.modules) {
                        const foundVideo = mod.videos.find(v => v.id === lastHistory.videoId);
                        if (foundVideo) {
                            lastWatchedVideo = {
                                id: foundVideo.id,
                                title: foundVideo.title,
                                thumbnailUrl: foundVideo.thumbnailUrl,
                                progress: lastHistory.progress,
                                moduleName: mod.name
                            };
                            break;
                        }
                    }
                }
            }

            const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

            return {
                id: course.id,
                name: course.name,
                description: course.description,
                thumbnailUrl: course.thumbnailUrl,
                modules: course.modules,
                progressPercent,
                totalVideos,
                completedVideos,
                lastWatchedVideo,
                lastWatchedAt
            };
        });

        res.json(coursesWithProgress);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar cursos.' });
    }
});

// ============================================================
// AULA INDIVIDUAL
// ============================================================
router.get('/lesson/:videoId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const videoId = req.params.videoId as string;

        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: {
                id: true,
                title: true,
                description: true,
                content: true,
                thumbnailUrl: true,
                hlsUrl: true,
                status: true,
                order: true,
                moduleId: true,
                module: {
                    select: {
                        id: true,
                        name: true,
                        order: true,
                        pdfUrl: true,
                        course: { select: { id: true, name: true, calendarUrl: true } }
                    }
                }
            }
        });

        if (!video) {
            res.status(404).json({ message: 'Aula não encontrada.' });
            return;
        }

        // Enrollment check + prev/next em paralelo (ambos precisam do courseId)
        const courseId = video.module.course.id;
        const [enrollment, allModules] = await Promise.all([
            prisma.courseEnrollment.findUnique({
                where: { userId_courseId: { userId, courseId } }
            }),
            prisma.module.findMany({
                where: { courseId },
                orderBy: { order: 'asc' },
                select: {
                    videos: {
                        orderBy: { order: 'asc' },
                        select: { id: true, title: true }
                    }
                }
            })
        ]);

        if (!enrollment) {
            res.status(403).json({ message: 'Acesso negado. Você não está matriculado neste curso.' });
            return;
        }

        const allVideos = allModules.flatMap(m => m.videos);
        const currentIndex = allVideos.findIndex(v => v.id === videoId);
        const prevVideo = currentIndex > 0 ? allVideos[currentIndex - 1] : null;
        const nextVideo = currentIndex < allVideos.length - 1 ? allVideos[currentIndex + 1] : null;

        res.json({
            ...video,
            prevVideo,
            nextVideo
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar aula.' });
    }
});

// ============================================================
// PROGRESSO
// ============================================================

// Salvar progresso de visualização
router.post('/progress', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { videoId, progress, completed } = req.body;

        if (!videoId) {
            res.status(400).json({ message: 'ID do vídeo é obrigatório.' });
            return;
        }

        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: { module: { select: { courseId: true } } }
        });

        if (!video) {
            res.status(404).json({ message: 'Vídeo não encontrado.' });
            return;
        }

        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId: video.module.courseId } }
        });

        if (!enrollment) {
            res.status(403).json({ message: 'Acesso negado. Você não está matriculado neste curso.' });
            return;
        }

        const history = await prisma.videoHistory.upsert({
            where: { userId_videoId: { userId, videoId } },
            update: { progress: progress || 0, completed: completed || false },
            create: { userId, videoId, progress: progress || 0, completed: completed || false }
        });

        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao salvar progresso.' });
    }
});

// Buscar progresso do aluno para um vídeo específico
router.get('/progress/:videoId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const videoId = req.params.videoId as string;

        const history = await prisma.videoHistory.findUnique({
            where: { userId_videoId: { userId, videoId } }
        });

        res.json(history || { progress: 0, completed: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar progresso.' });
    }
});

// ============================================================
// CERTIFICADO
// ============================================================
router.get('/certificate/:courseId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const courseId = req.params.courseId as string;

        // Valida matrícula
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId } }
        });
        if (!enrollment) {
            res.status(403).json({ message: 'Acesso negado.' });
            return;
        }

        // Busca curso + vídeos + progresso
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: {
                name: true,
                modules: {
                    select: { videos: { select: { id: true } } }
                }
            }
        });

        if (!course) {
            res.status(404).json({ message: 'Curso não encontrado.' });
            return;
        }

        const videoIds = course.modules.flatMap(m => m.videos.map(v => v.id));
        if (videoIds.length === 0) {
            res.status(400).json({ message: 'Curso sem aulas.' });
            return;
        }

        const completedCount = await prisma.videoHistory.count({
            where: { userId, videoId: { in: videoIds }, completed: true }
        });

        if (completedCount < videoIds.length) {
            res.status(400).json({
                message: `Progresso incompleto: ${completedCount}/${videoIds.length} aulas concluídas.`
            });
            return;
        }

        // Busca nome do aluno
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        });

        // Retorna dados para o frontend gerar o certificado
        res.json({
            studentName: user!.name,
            courseName: course.name,
            completedAt: new Date().toISOString(),
            totalLessons: videoIds.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao gerar certificado.' });
    }
});

// ============================================================
// NOTIFICAÇÕES
// ============================================================
router.get('/notifications', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar notificações.' });
    }
});

router.put('/notifications/read-all', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        await prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });
        res.json({ message: 'Todas marcadas como lidas.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao marcar notificações.' });
    }
});

router.put('/notifications/:id/read', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const notifId = req.params.id as string;

        const notif = await prisma.notification.findUnique({ where: { id: notifId } });
        if (!notif || notif.userId !== userId) {
            res.status(404).json({ message: 'Notificação não encontrada.' });
            return;
        }

        await prisma.notification.update({ where: { id: notifId }, data: { read: true } });
        res.json({ message: 'Marcada como lida.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao marcar notificação.' });
    }
});

// ============================================================
// AULAS AO VIVO (Live Classes)
// ============================================================

// LIST live classes for a course (enrolled students only)
router.get('/live-classes/:courseId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const courseId = req.params.courseId as string;

        // Validate enrollment
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId } }
        });
        if (!enrollment) {
            res.status(403).json({ message: 'Você não está matriculado neste curso.' });
            return;
        }

        const liveClasses = await prisma.liveClass.findMany({
            where: {
                courseId,
                status: { in: ['SCHEDULED', 'LIVE'] }
            },
            orderBy: { startAt: 'asc' },
            select: {
                id: true,
                title: true,
                description: true,
                startAt: true,
                endAt: true,
                status: true,
                zoomJoinUrl: true,
                module: { select: { id: true, name: true } }
            }
        });

        res.json(liveClasses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar aulas ao vivo.' });
    }
});

// GET live classes across all enrolled courses (for dashboard)
router.get('/my-live-classes', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        const enrollments = await prisma.courseEnrollment.findMany({
            where: { userId },
            select: { courseId: true }
        });
        const courseIds = enrollments.map(e => e.courseId);

        const liveClasses = await prisma.liveClass.findMany({
            where: {
                courseId: { in: courseIds },
                status: { in: ['SCHEDULED', 'LIVE'] }
            },
            orderBy: { startAt: 'asc' },
            select: {
                id: true,
                title: true,
                description: true,
                startAt: true,
                endAt: true,
                status: true,
                zoomJoinUrl: true,
                course: { select: { id: true, name: true } },
                module: { select: { id: true, name: true } }
            }
        });

        res.json(liveClasses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar aulas ao vivo.' });
    }
});

// ============================================================
// COMENTÁRIOS / FÓRUM POR AULA
// ============================================================

// Helper: verifica se o aluno está banido do fórum
async function checkForumBan(userId: string): Promise<{ banned: boolean; ban?: any }> {
    const activeBan = await prisma.forumBan.findFirst({
        where: {
            userId,
            active: true,
            OR: [
                { expiresAt: null },            // ban permanente
                { expiresAt: { gt: new Date() } } // ban temporário ainda válido
            ]
        },
        orderBy: { createdAt: 'desc' }
    });

    if (activeBan) {
        return { banned: true, ban: activeBan };
    }

    // Auto-expirar bans vencidos
    await prisma.forumBan.updateMany({
        where: { userId, active: true, expiresAt: { lte: new Date() } },
        data: { active: false }
    });

    return { banned: false };
}

// Helper: aplica punição automática baseada no histórico de violações
async function applyAutoPunishment(userId: string, severity: 'LIGHT' | 'MEDIUM' | 'SEVERE', word: string): Promise<{ action: string; message: string }> {
    // Busca config para ver se punição está ativada
    const config = await prisma.platformConfig.findFirst();
    if (!config?.forumPunishmentEnabled) {
        return { action: 'NONE', message: `⚠️ Violação registrada: uso do termo "${word}". Sua mensagem foi bloqueada.` };
    }

    // Conta violações anteriores do aluno
    const violationCount = await prisma.forumViolation.count({ where: { userId } });
    const thisViolationNumber = violationCount + 1; // incluindo esta

    let autoAction = 'WARNING';
    let banType: string | null = null;
    let banDays: number | null = null;
    let message = '';

    if (severity === 'SEVERE') {
        // Grave: vai direto para comissão (10 dias de ban)
        autoAction = 'BAN_10D';
        banType = 'TEMP_10D';
        banDays = 10;
        message = `🚨 VIOLAÇÃO GRAVE — Uso do termo "${word}"\n\nSeu acesso ao fórum foi suspenso por 10 dias. O caso será analisado pela comissão avaliadora.\n\nVocê pode enviar um recurso pelo painel.`;
    } else if (severity === 'MEDIUM' || thisViolationNumber >= 4) {
        // Média ou reincidente (4+): 2 dias de ban
        if (thisViolationNumber >= 5) {
            // Reincidente: suspensão total
            autoAction = 'BAN_PERMANENT';
            banType = 'PERMANENT';
            banDays = null;
            message = `🚫 SUSPENSÃO TOTAL DO FÓRUM — Uso do termo "${word}"\n\nDevido ao histórico de reincidência (${thisViolationNumber}ª violação), seu acesso ao fórum foi suspenso permanentemente.\n\nVocê pode enviar um recurso pelo painel.`;
        } else {
            autoAction = 'BAN_2D';
            banType = 'TEMP_2D';
            banDays = 2;
            message = `⛔ VIOLAÇÃO MÉDIA — Uso do termo "${word}"\n\nSeu acesso ao fórum foi suspenso por 2 dias.\nEsta é sua ${thisViolationNumber}ª violação.\n\nVocê pode enviar um recurso pelo painel.`;
        }
    } else if (severity === 'LIGHT') {
        if (thisViolationNumber >= 3) {
            // 3ª violação leve: 1 dia de ban
            autoAction = 'BAN_1D';
            banType = 'TEMP_1D';
            banDays = 1;
            message = `⚠️ VIOLAÇÃO LEVE (3ª vez) — Uso do termo "${word}"\n\nSeu acesso ao fórum foi suspenso por 1 dia.\n\nVocê pode enviar um recurso pelo painel.`;
        } else {
            // 1ª/2ª violação leve: apenas aviso
            autoAction = 'WARNING';
            message = `⚠️ AVISO DE VIOLAÇÃO — Uso do termo "${word}"\n\nSua mensagem foi bloqueada. Esta é sua ${thisViolationNumber}ª violação.\nNa 3ª violação, seu acesso ao fórum será suspenso automaticamente.`;
        }
    }

    // Cria ban se aplicável
    if (banType) {
        const expiresAt = banDays ? new Date(Date.now() + banDays * 24 * 60 * 60 * 1000) : null;
        await prisma.forumBan.create({
            data: { userId, reason: `Auto: termo "${word}" (${severity})`, banType, expiresAt }
        });
    }

    return { action: autoAction, message };
}

// Listar comentários de uma aula (com respostas aninhadas 1 nível)
router.get('/comments/:videoId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const videoId = req.params.videoId as string;
        const after = req.query.after as string | undefined;

        // Verifica se vídeo existe e se comentários estão habilitados
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: { commentsEnabled: true, module: { select: { courseId: true } } }
        });
        if (!video) { res.status(404).json({ message: 'Aula não encontrada.' }); return; }

        // Verifica matrícula
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId: video.module.courseId } }
        });
        if (!enrollment) { res.status(403).json({ message: 'Acesso negado.' }); return; }

        // Verifica ban do fórum
        const banCheck = await checkForumBan(userId);

        // Condição de polling: apenas comentários mais recentes que 'after'
        const whereClause: any = { videoId, parentId: null };
        if (after) {
            whereClause.createdAt = { gt: new Date(after) };
        }

        const comments = await prisma.lessonComment.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true,
                text: true,
                flagged: true,
                createdAt: true,
                userId: true,
                user: { select: { id: true, name: true, role: true } },
                replies: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        text: true,
                        flagged: true,
                        createdAt: true,
                        userId: true,
                        user: { select: { id: true, name: true, role: true } },
                        _count: { select: { reports: true } }
                    }
                },
                _count: { select: { reports: true } }
            }
        });

        res.json({
            commentsEnabled: video.commentsEnabled,
            comments,
            forumBan: banCheck.banned ? {
                banType: banCheck.ban.banType,
                expiresAt: banCheck.ban.expiresAt,
                reason: banCheck.ban.reason
            } : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar comentários.' });
    }
});

// Criar comentário (com filtro de profanidade + sistema de punição)
router.post('/comments', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { videoId, text, parentId } = req.body;

        if (!videoId || !text?.trim()) {
            res.status(400).json({ message: 'Vídeo e texto são obrigatórios.' });
            return;
        }

        if (text.trim().length > 2000) {
            res.status(400).json({ message: 'Comentário muito longo (máx. 2000 caracteres).' });
            return;
        }

        // Verifica ban ativo
        const banCheck = await checkForumBan(userId);
        if (banCheck.banned) {
            const expiry = banCheck.ban.expiresAt
                ? `Seu acesso retorna em ${new Date(banCheck.ban.expiresAt).toLocaleDateString('pt-BR')}.`
                : 'Seu acesso ao fórum está suspenso permanentemente.';
            res.status(403).json({
                message: `Você está suspenso do fórum. ${expiry}`,
                violation: true,
                banType: banCheck.ban.banType,
                expiresAt: banCheck.ban.expiresAt
            });
            return;
        }

        // Verifica vídeo e se comentários estão habilitados
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: { commentsEnabled: true, module: { select: { courseId: true } } }
        });
        if (!video) { res.status(404).json({ message: 'Aula não encontrada.' }); return; }
        if (!video.commentsEnabled) {
            res.status(403).json({ message: 'Comentários desabilitados nesta aula.' });
            return;
        }

        // Verifica matrícula
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId: video.module.courseId } }
        });
        if (!enrollment) { res.status(403).json({ message: 'Acesso negado.' }); return; }

        // Se é resposta, valida que o pai existe e pertence ao mesmo vídeo
        if (parentId) {
            const parent = await prisma.lessonComment.findUnique({ where: { id: parentId } });
            if (!parent || parent.videoId !== videoId || parent.parentId !== null) {
                res.status(400).json({ message: 'Comentário pai inválido.' });
                return;
            }
        }

        // Filtro de profanidade
        const filterResult = checkProfanity(text.trim());
        if (filterResult.blocked && filterResult.severity && filterResult.matchedWord) {
            // Registra violação
            const punishment = await applyAutoPunishment(userId, filterResult.severity, filterResult.matchedWord);

            await prisma.forumViolation.create({
                data: {
                    userId,
                    word: filterResult.matchedWord,
                    severity: filterResult.severity,
                    message: text.trim(),
                    autoAction: punishment.action
                }
            });

            res.status(422).json({
                message: punishment.message,
                violation: true,
                severity: filterResult.severity,
                matchedWord: filterResult.matchedWord,
                action: punishment.action
            });
            return;
        }

        const comment = await prisma.lessonComment.create({
            data: {
                text: text.trim(),
                userId,
                videoId,
                parentId: parentId || null,
                flagged: filterResult.flagged
            },
            select: {
                id: true,
                text: true,
                flagged: true,
                createdAt: true,
                userId: true,
                user: { select: { id: true, name: true, role: true } }
            }
        });

        res.status(201).json(comment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar comentário.' });
    }
});

// Deletar próprio comentário
router.delete('/comments/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const commentId = req.params.id as string;

        const comment = await prisma.lessonComment.findUnique({ where: { id: commentId } });
        if (!comment) { res.status(404).json({ message: 'Comentário não encontrado.' }); return; }
        if (comment.userId !== userId) { res.status(403).json({ message: 'Sem permissão.' }); return; }

        await prisma.lessonComment.delete({ where: { id: commentId } });
        res.json({ message: 'Comentário removido.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao deletar comentário.' });
    }
});

// Denunciar comentário
router.post('/comments/:id/report', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const commentId = req.params.id as string;
        const { reason } = req.body;

        if (!reason?.trim()) {
            res.status(400).json({ message: 'Motivo da denúncia é obrigatório.' });
            return;
        }

        const comment = await prisma.lessonComment.findUnique({ where: { id: commentId } });
        if (!comment) { res.status(404).json({ message: 'Comentário não encontrado.' }); return; }

        // Não pode denunciar o próprio
        if (comment.userId === userId) {
            res.status(400).json({ message: 'Não é possível denunciar seu próprio comentário.' });
            return;
        }

        // Cria denúncia (unique constraint impede duplicata)
        await prisma.commentReport.create({
            data: { commentId, userId, reason: reason.trim() }
        });

        // Flag automático se tiver 2+ denúncias
        const reportCount = await prisma.commentReport.count({ where: { commentId } });
        if (reportCount >= 2) {
            await prisma.lessonComment.update({ where: { id: commentId }, data: { flagged: true } });
        }

        res.status(201).json({ message: 'Denúncia registrada.' });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({ message: 'Você já denunciou este comentário.' });
            return;
        }
        console.error(error);
        res.status(500).json({ message: 'Erro ao denunciar.' });
    }
});

// ============================================================
// VIOLAÇÕES E RECURSOS DO ALUNO
// ============================================================

// Ver minhas violações e status do ban
router.get('/forum/my-status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        const [violations, banCheck, appeals] = await Promise.all([
            prisma.forumViolation.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: { id: true, word: true, severity: true, autoAction: true, createdAt: true }
            }),
            checkForumBan(userId),
            prisma.forumAppeal.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, reason: true, status: true, adminNote: true, createdAt: true, updatedAt: true }
            })
        ]);

        res.json({
            violations,
            totalViolations: violations.length,
            ban: banCheck.banned ? {
                banType: banCheck.ban.banType,
                expiresAt: banCheck.ban.expiresAt,
                reason: banCheck.ban.reason,
                createdAt: banCheck.ban.createdAt
            } : null,
            appeals
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar status do fórum.' });
    }
});

// Enviar recurso
router.post('/forum/appeal', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { reason } = req.body;

        if (!reason?.trim() || reason.trim().length < 10) {
            res.status(400).json({ message: 'O recurso deve ter pelo menos 10 caracteres.' });
            return;
        }

        // Verifica se já tem recurso pendente
        const pendingAppeal = await prisma.forumAppeal.findFirst({
            where: { userId, status: 'PENDING' }
        });
        if (pendingAppeal) {
            res.status(409).json({ message: 'Você já tem um recurso pendente aguardando análise.' });
            return;
        }

        const appeal = await prisma.forumAppeal.create({
            data: { userId, reason: reason.trim() },
            select: { id: true, reason: true, status: true, createdAt: true }
        });

        res.status(201).json(appeal);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao enviar recurso.' });
    }
});

// ============================================================
// SISTEMA DE PRESENÇA — HEARTBEAT
// ============================================================
// O frontend envia heartbeat a cada 30s enquanto o aluno assiste.
// Acumula watchTimeSeconds. Se atingir o mínimo configurado, marca PRESENT.
router.post('/attendance/heartbeat', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { moduleId } = req.body;

        if (!moduleId) {
            res.status(400).json({ message: 'moduleId é obrigatório.' });
            return;
        }

        // Verifica se o sistema de presença está ativo
        const config = await prisma.platformConfig.findFirst();
        if (!config?.attendanceEnabled) {
            res.json({ message: 'Sistema de presença desativado.', tracked: false });
            return;
        }

        // Verifica se o aluno está matriculado no curso do módulo
        const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
        if (!mod) {
            res.status(404).json({ message: 'Módulo não encontrado.' });
            return;
        }

        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId: mod.courseId } }
        });
        if (!enrollment) {
            res.status(403).json({ message: 'Não matriculado neste curso.' });
            return;
        }

        // Data de hoje (sem hora) no timezone do servidor
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Upsert attendance: cria ou incrementa watchTimeSeconds
        const existing = await prisma.attendance.findUnique({
            where: { userId_moduleId_date: { userId, moduleId, date: today } }
        });

        const incrementSeconds = 30; // cada heartbeat = 30s
        const thresholdSeconds = (config.attendanceMinMinutes || 20) * 60;

        if (existing) {
            const newWatchTime = existing.watchTimeSeconds + incrementSeconds;
            const shouldMarkPresent = !existing.autoDetected && newWatchTime >= thresholdSeconds;

            await prisma.attendance.update({
                where: { id: existing.id },
                data: {
                    watchTimeSeconds: newWatchTime,
                    ...(shouldMarkPresent ? { status: 'PRESENT', autoDetected: true } : {})
                }
            });

            res.json({
                tracked: true,
                watchTimeSeconds: newWatchTime,
                status: shouldMarkPresent ? 'PRESENT' : existing.status,
                threshold: thresholdSeconds
            });
        } else {
            const shouldMarkPresent = incrementSeconds >= thresholdSeconds;

            const attendance = await prisma.attendance.create({
                data: {
                    userId,
                    moduleId,
                    date: today,
                    watchTimeSeconds: incrementSeconds,
                    status: shouldMarkPresent ? 'PRESENT' : 'ABSENT',
                    autoDetected: shouldMarkPresent
                }
            });

            res.json({
                tracked: true,
                watchTimeSeconds: attendance.watchTimeSeconds,
                status: attendance.status,
                threshold: thresholdSeconds
            });
        }
    } catch (error) {
        console.error('Erro no heartbeat de presença:', error);
        res.status(500).json({ message: 'Erro ao registrar presença.' });
    }
});

export default router;
