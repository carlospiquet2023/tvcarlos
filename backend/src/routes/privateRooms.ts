import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { asyncHandler } from '../lib/http';
import { createInputValidator } from '../lib/validation';

export const asyncRoute = asyncHandler;

const privateRoomInput = createInputValidator(
    (_issue, message) => invalidInput(message),
    {
        messages: {
            required: (field) => `Missing or invalid ${field}`,
            uuid: (field) => `Missing or invalid UUID ${field}`,
        },
        uuidPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        uuidMaximum: null,
        unwrapArrays: false,
    },
);

export const requiredString = (value: unknown, name: string) => {
    return privateRoomInput.requiredText(value, name);
};

export const requiredUuid = (value: unknown, name: string) => {
    return privateRoomInput.requiredUuid(value, name);
};
export const privateRoomsRouter = Router();
export const adminPrivateRoomsRouter = Router();

// --- PUBLIC/STUDENT ROUTES ---

privateRoomsRouter.post('/:slug/auth', asyncRoute(async (req: Request, res: Response) => {
    const slug = validSlug(req.params.slug);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
        return res.status(400).json({ error: 'Senha é obrigatória' });
    }

    const room = await prisma.privateRoom.findUnique({ where: { slug } });
    if (!room || !room.active) {
        return res.status(404).json({ error: 'Sala não encontrada ou inativa' });
    }

    const passwordMatches = await verifyAndUpgradeRoomPassword(room.id, room.passwordHash, password);
    if (!passwordMatches) {
        return res.status(401).json({ error: 'Senha incorreta' });
    }

    res.json({
        id: room.id,
        title: room.title,
        description: room.description,
        slug: room.slug,
        videoUrl: room.videoUrl
    });
}));

// --- ADMIN ROUTES ---
adminPrivateRoomsRouter.use(authenticateToken, requireRole(['ADMIN', 'TEACHER']));

adminPrivateRoomsRouter.get('/', asyncRoute(async (req: Request, res: Response) => {
    const isAdmin = req.user?.role === 'ADMIN';
    const ownerId = isAdmin ? undefined : req.user?.id;

    const rooms = await prisma.privateRoom.findMany({
        where: ownerId ? { ownerId } : undefined,
        orderBy: { createdAt: 'desc' },
        select: roomPublicSelect,
    });
    res.json(rooms);
}));

adminPrivateRoomsRouter.post('/', asyncRoute(async (req: Request, res: Response) => {
    const { title, description, slug, password, videoUrl, active } = req.body;
    const normalizedTitle = validTitle(title);
    const normalizedSlug = validSlug(slug);
    const normalizedPassword = validRoomPassword(password);
    const normalizedVideoUrl = validVideoUrl(videoUrl);

    const existing = await prisma.privateRoom.findUnique({ where: { slug: normalizedSlug } });
    if (existing) {
        return res.status(400).json({ error: 'O slug (URL) já está em uso.' });
    }

    const passwordHash = await hashRoomPassword(normalizedPassword);
    const room = await prisma.$transaction(async (tx) => {
        const created = await tx.privateRoom.create({
            data: {
                title: normalizedTitle,
                description: validDescription(description),
                slug: normalizedSlug,
                passwordHash,
                videoUrl: normalizedVideoUrl,
                active: active !== undefined ? Boolean(active) : true,
                ownerId: req.user?.id
            },
            select: roomPublicSelect,
        });
        await tx.auditLog.create({
            data: { userId: req.user?.id, action: 'PRIVATE_ROOM_CREATE', target: created.id, details: created.slug }
        });
        return created;
    });
    res.status(201).json(room);
}));

adminPrivateRoomsRouter.put('/:id', asyncRoute(async (req: Request, res: Response) => {
    const id = requiredUuid(req.params.id, 'id');
    const { title, description, slug, password, videoUrl, active } = req.body;

    const existing = await prisma.privateRoom.findUnique({ where: { id } });
    if (!existing) {
        return res.status(404).json({ error: 'Sala não encontrada' });
    }

    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && existing.ownerId !== req.user?.id) {
        return res.status(403).json({ error: 'Você não tem permissão para editar esta sala.' });
    }

    if (slug && slug !== existing.slug) {
        const slugExists = await prisma.privateRoom.findUnique({ where: { slug: validSlug(slug) } });
        if (slugExists) return res.status(400).json({ error: 'O slug (URL) já está em uso.' });
    }

    const passwordHash = password ? await hashRoomPassword(validRoomPassword(password)) : undefined;
    const room = await prisma.$transaction(async (tx) => {
        const updated = await tx.privateRoom.update({
            where: { id },
            data: {
                title: title !== undefined ? validTitle(title) : undefined,
                description: description !== undefined ? validDescription(description) : undefined,
                slug: slug !== undefined ? validSlug(slug) : undefined,
                passwordHash,
                videoUrl: videoUrl !== undefined ? validVideoUrl(videoUrl) : undefined,
                active: active !== undefined ? Boolean(active) : undefined,
            },
            select: roomPublicSelect,
        });
        await tx.auditLog.create({
            data: { userId: req.user?.id, action: 'PRIVATE_ROOM_UPDATE', target: id, details: updated.slug }
        });
        return updated;
    });
    res.json(room);
}));

adminPrivateRoomsRouter.delete('/:id', asyncRoute(async (req: Request, res: Response) => {
    const id = requiredUuid(req.params.id, 'id');
    const existing = await prisma.privateRoom.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Sala não encontrada' });

    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && existing.ownerId !== req.user?.id) {
        return res.status(403).json({ error: 'Você não tem permissão para deletar esta sala.' });
    }

    await prisma.$transaction(async (tx) => {
        await tx.privateRoom.delete({ where: { id } });
        await tx.auditLog.create({
            data: { userId: req.user?.id, action: 'PRIVATE_ROOM_DELETE', target: id, details: existing.slug }
        });
    });
    res.status(204).send();
}));

const roomPublicSelect = {
    id: true,
    title: true,
    description: true,
    slug: true,
    videoUrl: true,
    ownerId: true,
    active: true,
    createdAt: true,
    updatedAt: true,
} as const;

export function validSlug(value: unknown): string {
    const slug = requiredString(value, 'slug').toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
        throw invalidInput('Invalid slug');
    }
    return slug;
}

function validTitle(value: unknown): string {
    const title = requiredString(value, 'title');
    if (title.length > 160) throw invalidInput('Invalid title');
    return title;
}

function validDescription(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.length > 5_000) throw invalidInput('Invalid description');
    return value.trim();
}

export function validRoomPassword(value: unknown): string {
    const password = requiredString(value, 'password');
    if (password.length < 10 || password.length > 128) throw invalidInput('Invalid room password');
    return password;
}

export function validVideoUrl(value: unknown): string {
    const videoUrl = requiredString(value, 'videoUrl');
    if (videoUrl.length > 2048 || (!videoUrl.startsWith('/') && !/^https:\/\//i.test(videoUrl))) {
        throw invalidInput('Invalid video URL');
    }
    return videoUrl;
}

async function verifyAndUpgradeRoomPassword(roomId: string, storedValue: string, candidate: string): Promise<boolean> {
    if (storedValue.startsWith('$2')) return matchesRoomPassword(storedValue, candidate);

    // Compatibilidade temporária para salas criadas antes do hardening: uma
    // correspondência válida é imediatamente convertida para bcrypt.
    const stored = Buffer.from(storedValue);
    const provided = Buffer.from(candidate);
    const matches = stored.length === provided.length && cryptoSafeEqual(stored, provided);
    if (matches) {
        await prisma.privateRoom.update({
            where: { id: roomId },
            data: { passwordHash: await hashRoomPassword(candidate) },
        });
        logger.warn({ roomId }, 'Segredo legado de sala privada migrado para bcrypt');
    }
    return matches;
}

export async function hashRoomPassword(password: string): Promise<string> {
    return bcrypt.hash(validRoomPassword(password), 12);
}

export async function matchesRoomPassword(passwordHash: string, candidate: string): Promise<boolean> {
    if (!passwordHash.startsWith('$2') || typeof candidate !== 'string') return false;
    return bcrypt.compare(candidate, passwordHash);
}

function cryptoSafeEqual(left: Buffer, right: Buffer): boolean {
    return crypto.timingSafeEqual(left, right);
}

function invalidInput(message: string): Error & { status: number } {
    return Object.assign(new Error(message), { status: 400 });
}
