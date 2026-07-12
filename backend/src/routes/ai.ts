import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { AiProviderError, GroqClient, type GroqChatMessage } from '../services/ai/groqClient';
import {
    buildTutorSystemPrompt,
    PerUserRateLimiter,
    SAFE_AI_UNAVAILABLE_MESSAGE,
} from '../services/ai/aiSupport';

const router = Router();
const groq = new GroqClient();
const messageLimiter = new PerUserRateLimiter(
    boundedEnvironmentInteger('AI_RATE_LIMIT_MAX', 20, 1, 200),
    boundedEnvironmentInteger('AI_RATE_LIMIT_WINDOW_MS', 15 * 60_000, 10_000, 24 * 60 * 60_000),
);

router.use(authenticateToken);

router.get('/status', asyncRoute(async (_req, res) => {
    res.json(publicProviderStatus());
}));

router.get('/metrics', requireRole(['ADMIN']), asyncRoute(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const [
        conversations,
        conversationsLast30Days,
        messages,
        messagesLast30Days,
        profiles,
        activeUsers,
        usage,
        models,
    ] = await Promise.all([
        prisma.aiConversation.count(),
        prisma.aiConversation.count({ where: { createdAt: { gte: since } } }),
        prisma.aiMessage.count(),
        prisma.aiMessage.count({ where: { createdAt: { gte: since } } }),
        prisma.studentLearningProfile.count(),
        prisma.aiConversation.findMany({
            where: { updatedAt: { gte: since } },
            distinct: ['userId'],
            select: { userId: true },
        }),
        prisma.aiMessage.aggregate({
            where: { createdAt: { gte: since }, role: 'ASSISTANT' },
            _sum: { promptTokens: true, completionTokens: true, latencyMs: true },
            _avg: { latencyMs: true },
        }),
        prisma.aiMessage.groupBy({
            by: ['model'],
            where: { createdAt: { gte: since }, role: 'ASSISTANT', model: { not: null } },
            _count: { _all: true },
            _sum: { promptTokens: true, completionTokens: true },
        }),
    ]);

    res.json({
        periodDays: 30,
        totals: { conversations, messages, profiles },
        period: {
            conversations: conversationsLast30Days,
            messages: messagesLast30Days,
            activeUsers: activeUsers.length,
            promptTokens: usage._sum.promptTokens ?? 0,
            completionTokens: usage._sum.completionTokens ?? 0,
            averageLatencyMs: Math.round(usage._avg.latencyMs ?? 0),
        },
        models: models.map((item) => ({
            model: item.model,
            messages: item._count._all,
            promptTokens: item._sum.promptTokens ?? 0,
            completionTokens: item._sum.completionTokens ?? 0,
        })),
        provider: publicProviderStatus(),
    });
}));

router.use(requireStudent);

router.get('/bootstrap', asyncRoute(async (req, res) => {
    const userId = req.user!.id;
    const [profile, conversations] = await Promise.all([
        prisma.studentLearningProfile.findUnique({ where: { userId } }),
        prisma.aiConversation.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            take: 12,
            include: {
                course: { select: { id: true, name: true } },
                lesson: { select: { id: true, title: true } },
                _count: { select: { messages: true } },
            },
        }),
    ]);

    res.json({
        provider: publicProviderStatus(),
        profile: profile ?? defaultProfile(userId),
        conversations,
    });
}));

router.get('/profile', asyncRoute(async (req, res) => {
    const userId = req.user!.id;
    const profile = await prisma.studentLearningProfile.findUnique({ where: { userId } });
    res.json(profile ?? defaultProfile(userId));
}));

router.put('/profile', asyncRoute(async (req, res) => {
    const userId = req.user!.id;
    const data = validateProfileInput(req.body);
    const profile = await prisma.studentLearningProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
    });
    res.json(profile);
}));

router.get('/conversations', asyncRoute(async (req, res) => {
    const limit = boundedQueryInteger(req.query.limit, 30, 1, 50);
    const courseId = optionalUuid(req.query.courseId, 'courseId');
    const lessonId = optionalUuid(req.query.lessonId ?? req.query.videoId, 'lessonId');
    const conversations = await prisma.aiConversation.findMany({
        where: {
            userId: req.user!.id,
            ...(courseId ? { courseId } : {}),
            ...(lessonId ? { lessonId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: {
            course: { select: { id: true, name: true } },
            lesson: { select: { id: true, title: true } },
            _count: { select: { messages: true } },
        },
    });
    res.json({ conversations, items: conversations });
}));

router.post('/conversations', asyncRoute(async (req, res) => {
    const input = validateConversationInput(req.body);
    const context = await resolveStudentContext(req.user!.id, input.courseId, input.lessonId);
    const conversation = await prisma.aiConversation.create({
        data: {
            userId: req.user!.id,
            courseId: context.courseId,
            lessonId: context.lessonId,
            title: input.title,
        },
        include: {
            course: { select: { id: true, name: true } },
            lesson: { select: { id: true, title: true } },
            _count: { select: { messages: true } },
        },
    });
    res.status(201).json({ conversation });
}));

router.get('/conversations/:id', asyncRoute(async (req, res) => {
    const conversation = await ownedConversation(req.user!.id, requiredUuid(req.params.id, 'id'));
    res.json({ conversation });
}));

router.get('/conversations/:id/history', asyncRoute(async (req, res) => {
    const id = requiredUuid(req.params.id, 'id');
    const limit = boundedQueryInteger(req.query.limit, 100, 1, 200);
    const conversation = await ownedConversation(req.user!.id, id);
    const messages = await prisma.aiMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        take: limit,
    });
    res.json({ conversation, messages });
}));

router.delete('/conversations/:id', asyncRoute(async (req, res) => {
    const id = requiredUuid(req.params.id, 'id');
    const result = await prisma.aiConversation.deleteMany({ where: { id, userId: req.user!.id } });
    if (result.count === 0) throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversa nao encontrada.');
    res.status(204).send();
}));

const perUserMessageRateLimit: RequestHandler = (req, res, next) => {
    const result = messageLimiter.consume(req.user!.id);
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
            code: 'AI_RATE_LIMITED',
            message: 'Limite de mensagens ao professor de IA atingido. Aguarde antes de tentar novamente.',
            retryAfterSeconds: result.retryAfterSeconds,
        });
        return;
    }
    next();
};

router.post('/chat', perUserMessageRateLimit, asyncRoute(handleChat));
router.post('/conversations/:id/messages', perUserMessageRateLimit, asyncRoute(handleChat));

async function handleChat(req: Request, res: Response): Promise<void> {
    const input = validateChatInput(req.body, req.params.id);
    let conversation = input.conversationId
        ? await ownedConversation(req.user!.id, input.conversationId)
        : null;

    if (!conversation) {
        const context = await resolveStudentContext(req.user!.id, input.courseId, input.lessonId);
        conversation = await prisma.aiConversation.create({
            data: {
                userId: req.user!.id,
                courseId: context.courseId,
                lessonId: context.lessonId,
                title: input.title ?? titleFromMessage(input.message),
            },
            include: conversationInclude,
        });
    } else {
        if (conversation.status !== 'ACTIVE') {
            throw new HttpError(409, 'CONVERSATION_ARCHIVED', 'Esta conversa esta arquivada.');
        }
        if (input.courseId && conversation.courseId !== input.courseId) {
            throw new HttpError(400, 'CONTEXT_MISMATCH', 'O curso informado nao pertence a conversa.');
        }
        if (input.lessonId && conversation.lessonId !== input.lessonId) {
            throw new HttpError(400, 'CONTEXT_MISMATCH', 'A aula informada nao pertence a conversa.');
        }
        await resolveStudentContext(req.user!.id, conversation.courseId ?? undefined, conversation.lessonId ?? undefined);
    }

    const [profile, history] = await Promise.all([
        prisma.studentLearningProfile.findUnique({ where: { userId: req.user!.id } }),
        prisma.aiMessage.findMany({
            where: { conversationId: conversation.id, role: { in: ['USER', 'ASSISTANT'] } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { role: true, content: true },
        }),
    ]);
    const messages: GroqChatMessage[] = [
        {
            role: 'system',
            content: buildTutorSystemPrompt({
                studentName: 'Estudante',
                learningStage: profile?.learningStage,
                preferredLearningStyle: profile?.preferredLearningStyle,
                explanationDepth: profile?.explanationDepth,
                tone: profile?.tone,
                learningGoals: profile?.learningGoals,
                strengths: profile?.strengths,
                improvementAreas: profile?.improvementAreas,
                interests: profile?.interests,
                courseName: conversation.course?.name,
                courseDescription: conversation.course?.description,
                lessonTitle: conversation.lesson?.title,
                lessonDescription: conversation.lesson?.description,
                lessonContent: conversation.lesson?.content,
            }),
        },
        ...history.reverse().map((item): GroqChatMessage => ({
            role: item.role === 'USER' ? 'user' : 'assistant',
            content: item.content.slice(0, 4_000),
        })),
        { role: 'user', content: input.message },
    ];

    try {
        const result = await groq.chat(messages);
        const persisted = await prisma.$transaction(async (transaction) => {
            await transaction.aiMessage.create({
                data: { conversationId: conversation!.id, role: 'USER', content: input.message },
            });
            const assistantMessage = await transaction.aiMessage.create({
                data: {
                    conversationId: conversation!.id,
                    role: 'ASSISTANT',
                    content: result.content,
                    model: result.model,
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    latencyMs: result.latencyMs,
                },
            });
            const updatedConversation = await transaction.aiConversation.update({
                where: { id: conversation!.id },
                data: {
                    model: result.model,
                    lastMessageAt: new Date(),
                    ...(conversation!.title ? {} : { title: titleFromMessage(input.message) }),
                },
                include: conversationInclude,
            });
            return { assistantMessage, conversation: updatedConversation };
        });

        res.json({
            conversation: persisted.conversation,
            assistantMessage: persisted.assistantMessage,
            message: persisted.assistantMessage.content,
            content: persisted.assistantMessage.content,
            usedFallback: result.usedFallback,
        });
    } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        const status = groq.status();
        const persisted = await prisma.$transaction(async (transaction) => {
            await transaction.aiMessage.create({
                data: { conversationId: conversation!.id, role: 'USER', content: input.message },
            });
            const assistantMessage = await transaction.aiMessage.create({
                data: {
                    conversationId: conversation!.id,
                    role: 'ASSISTANT',
                    content: SAFE_AI_UNAVAILABLE_MESSAGE,
                    model: status.selectedModel,
                    errorCode: error.code,
                },
            });
            await transaction.aiConversation.update({
                where: { id: conversation!.id },
                data: { lastMessageAt: new Date(), model: status.selectedModel },
            });
            return assistantMessage;
        });
        res.status(error.statusCode).json({
            code: error.code,
            message: persisted.content,
            content: persisted.content,
            assistantMessage: persisted,
            conversation,
            retryable: error.retryable,
        });
    }
}

const conversationInclude = {
    course: { select: { id: true, name: true, description: true } },
    lesson: { select: { id: true, title: true, description: true, content: true } },
    _count: { select: { messages: true } },
} as const;

async function ownedConversation(userId: string, id: string) {
    const conversation = await prisma.aiConversation.findFirst({
        where: { id, userId },
        include: conversationInclude,
    });
    if (!conversation) throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversa nao encontrada.');
    return conversation;
}

async function resolveStudentContext(userId: string, requestedCourseId?: string, requestedLessonId?: string) {
    let courseId = requestedCourseId;
    let lessonId = requestedLessonId;
    let course: { id: string; name: string } | null = null;

    if (lessonId) {
        const lesson = await prisma.video.findUnique({
            where: { id: lessonId },
            select: {
                id: true,
                module: { select: { course: { select: { id: true, name: true } } } },
            },
        });
        if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Aula nao encontrada.');
        if (courseId && courseId !== lesson.module.course.id) {
            throw new HttpError(400, 'CONTEXT_MISMATCH', 'A aula nao pertence ao curso informado.');
        }
        courseId = lesson.module.course.id;
        course = lesson.module.course;
    } else if (courseId) {
        course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
        if (!course) throw new HttpError(404, 'COURSE_NOT_FOUND', 'Curso nao encontrado.');
    }

    if (courseId) {
        const enrollment = await prisma.courseEnrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
            select: { id: true },
        });
        if (!enrollment) throw new HttpError(403, 'ENROLLMENT_REQUIRED', 'Voce nao esta matriculado neste curso.');
    }

    return { courseId: courseId ?? null, lessonId: lessonId ?? null, course };
}

function validateConversationInput(body: unknown) {
    const object = requireObject(body);
    rejectUnknownKeys(object, ['courseId', 'lessonId', 'videoId', 'title']);
    return {
        courseId: optionalUuid(object.courseId, 'courseId'),
        lessonId: optionalUuid(object.lessonId ?? object.videoId, 'lessonId'),
        title: optionalText(object.title, 'title', 160),
    };
}

function validateChatInput(body: unknown, routeConversationId: unknown) {
    const object = requireObject(body);
    rejectUnknownKeys(object, ['conversationId', 'courseId', 'lessonId', 'videoId', 'title', 'message', 'content']);
    const message = requiredText(object.message ?? object.content, 'message', 4_000);
    return {
        conversationId: routeConversationId
            ? requiredUuid(routeConversationId, 'conversationId')
            : optionalUuid(object.conversationId, 'conversationId'),
        courseId: optionalUuid(object.courseId, 'courseId'),
        lessonId: optionalUuid(object.lessonId ?? object.videoId, 'lessonId'),
        title: optionalText(object.title, 'title', 160),
        message,
    };
}

function validateProfileInput(body: unknown) {
    const object = requireObject(body);
    const allowed = [
        'learningStage',
        'preferredLearningStyle',
        'learningStyle',
        'explanationDepth',
        'depth',
        'tone',
        'learningGoals',
        'goal',
        'strengths',
        'improvementAreas',
        'interests',
        'aiSummary',
    ];
    rejectUnknownKeys(object, allowed);
    const preferredLearningStyle = object.preferredLearningStyle ?? object.learningStyle;
    const explanationDepth = object.explanationDepth ?? object.depth;
    const learningGoals = object.learningGoals ?? object.goal;
    return {
        ...(object.learningStage !== undefined
            ? { learningStage: enumValue(object.learningStage, 'learningStage', LEARNING_STAGES) }
            : {}),
        ...(preferredLearningStyle !== undefined
            ? { preferredLearningStyle: enumValue(preferredLearningStyle, 'preferredLearningStyle', LEARNING_STYLES) }
            : {}),
        ...(explanationDepth !== undefined
            ? { explanationDepth: enumValue(explanationDepth, 'explanationDepth', EXPLANATION_DEPTHS) }
            : {}),
        ...(object.tone !== undefined
            ? { tone: enumValue(object.tone, 'tone', TUTOR_TONES) }
            : {}),
        ...(learningGoals !== undefined
            ? { learningGoals: nullableText(learningGoals, 'learningGoals', 4_000) }
            : {}),
        ...(object.strengths !== undefined
            ? { strengths: nullableText(object.strengths, 'strengths', 4_000) }
            : {}),
        ...(object.improvementAreas !== undefined
            ? { improvementAreas: nullableText(object.improvementAreas, 'improvementAreas', 4_000) }
            : {}),
        ...(object.interests !== undefined
            ? { interests: nullableText(object.interests, 'interests', 4_000) }
            : {}),
        ...(object.aiSummary !== undefined
            ? { aiSummary: nullableText(object.aiSummary, 'aiSummary', 4_000) }
            : {}),
    };
}

function publicProviderStatus() {
    const status = groq.status();
    return {
        provider: 'groq',
        configured: status.configured,
        available: status.configured,
        model: status.selectedModel,
        primaryModel: status.primaryModel,
        fallbackModel: status.fallbackModel,
        switchAt: status.switchAt.toISOString(),
    };
}

function defaultProfile(userId: string) {
    return {
        id: null,
        userId,
        learningStage: 'GENERAL',
        preferredLearningStyle: 'BALANCED',
        explanationDepth: 'GUIDED',
        tone: 'ENCOURAGING',
        learningGoals: null,
        strengths: null,
        improvementAreas: null,
        interests: null,
        aiSummary: null,
        createdAt: null,
        updatedAt: null,
    };
}

function requireStudent(req: Request, res: Response, next: NextFunction): void {
    if (req.user?.role !== 'STUDENT') {
        res.status(403).json({ code: 'STUDENT_ONLY', message: 'O professor de IA esta disponivel para contas de aluno.' });
        return;
    }
    next();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
    return (req, res, next) => {
        void Promise.resolve(handler(req, res)).catch(next);
    };
}

router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) {
        res.status(error.statusCode).json({ code: error.code, message: error.safeMessage });
        return;
    }
    if (error instanceof AiProviderError) {
        res.status(error.statusCode).json({ code: error.code, message: SAFE_AI_UNAVAILABLE_MESSAGE, retryable: error.retryable });
        return;
    }
    logger.error({ err: error, requestId: req.id }, 'Unhandled AI route error');
    res.status(500).json({ code: 'AI_INTERNAL_ERROR', message: 'Nao foi possivel concluir a operacao do professor de IA.' });
});

class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        public readonly safeMessage: string,
    ) {
        super(code);
    }
}

function requireObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, 'INVALID_INPUT', 'Envie um objeto JSON valido.');
    }
    return value as Record<string, unknown>;
}

function rejectUnknownKeys(object: Record<string, unknown>, allowed: string[]) {
    const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new HttpError(400, 'UNKNOWN_FIELDS', `Campos nao reconhecidos: ${unknown.join(', ')}.`);
}

function requiredText(value: unknown, field: string, maximum: number): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, 'INVALID_INPUT', `${field} e obrigatorio.`);
    }
    const text = value.trim();
    if (text.length > maximum) throw new HttpError(400, 'INVALID_INPUT', `${field} excede ${maximum} caracteres.`);
    return text;
}

function optionalText(value: unknown, field: string, maximum: number): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return requiredText(value, field, maximum);
}

function nullableText(value: unknown, field: string, maximum: number): string | null {
    return optionalText(value, field, maximum) ?? null;
}

function enumValue<const T extends readonly string[]>(value: unknown, field: string, allowed: T): T[number] {
    if (typeof value !== 'string' || !allowed.includes(value.toUpperCase())) {
        throw new HttpError(400, 'INVALID_INPUT', `${field} deve ser um de: ${allowed.join(', ')}.`);
    }
    return value.toUpperCase() as T[number];
}

function requiredUuid(value: unknown, field: string): string {
    const text = requiredText(Array.isArray(value) ? value[0] : value, field, 64);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
        throw new HttpError(400, 'INVALID_INPUT', `${field} deve ser um UUID valido.`);
    }
    return text;
}

function optionalUuid(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return requiredUuid(value, field);
}

function boundedQueryInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function boundedEnvironmentInteger(name: string, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(process.env[name]);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function titleFromMessage(message: string): string {
    return message.replace(/\s+/g, ' ').trim().slice(0, 80);
}

const LEARNING_STAGES = [
    'GENERAL',
    'LITERACY',
    'ELEMENTARY',
    'MIDDLE_SCHOOL',
    'HIGH_SCHOOL',
    'HIGHER_EDUCATION',
    'PROFESSIONAL',
    'EXAM_PREP',
] as const;

const LEARNING_STYLES = ['BALANCED', 'VISUAL', 'PRACTICAL', 'SOCRATIC'] as const;
const EXPLANATION_DEPTHS = ['CONCISE', 'GUIDED', 'DEEP'] as const;
const TUTOR_TONES = ['ENCOURAGING', 'DIRECT', 'ACADEMIC'] as const;

export default router;
