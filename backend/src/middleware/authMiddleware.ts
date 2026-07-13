/**
 * authMiddleware.ts — Middleware de Autenticação e Autorização
 *
 * Exporta:
 * - authenticateToken: Valida a sessão HttpOnly ou um JWT Bearer de integração
 * - authenticateStreamToken: Valida JWT Bearer curto e vinculado ao diretório HLS
 * - requireRole:       Verifica se o usuario logado tem a role exigida (ADMIN, TEACHER, STUDENT)
 *
 * Estende Express.Request com campo `user` tipado (JwtPayload)
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import {
    bearerTokenFromHeader,
    clearSessionCookies,
    sessionCookieFromRequest,
    sessionTokenFromRequest,
    synchronizeCsrfCookie,
} from '../lib/sessionCookies';

const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'STAFF' | 'GUARDIAN';

// Typed JWT payload
export interface JwtPayload {
    id: string;
    username?: string;
    email?: string;
    role: UserRole;
    name?: string;
    ver: number;
    mustChangePassword?: boolean;
    purpose?: 'stream';
    videoId?: string;
    iat?: number;
    exp?: number;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');

    const cookieToken = sessionCookieFromRequest(req);
    const token = sessionTokenFromRequest(req);

    if (!token) {
        res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
        return;
    }

    let decoded: JwtPayload;
    try {
        decoded = verifySessionToken(token);
    } catch {
        res.status(401).json({ message: 'Token inválido ou expirado.' });
        return;
    }

    try {
        // A versão no banco invalida imediatamente tokens emitidos antes de
        // reset de senha, troca de papel ou incidente de segurança.
        const currentUser = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                name: true,
                tokenVersion: true,
                mustChangePassword: true,
                accessBlocked: true,
            }
        });

        if (!currentUser) {
            res.status(401).json({ message: 'Sessão revogada. Entre novamente.' });
            return;
        }

        if (currentUser.accessBlocked) {
            clearSessionCookies(res);
            res.status(403).json({ message: 'Acesso bloqueado pela instituição. Procure a administração escolar.' });
            return;
        }

        if (currentUser.tokenVersion !== decoded.ver) {
            res.status(401).json({ message: 'Sessão revogada. Entre novamente.' });
            return;
        }

        if (cookieToken === token) synchronizeCsrfCookie(req, res, token, decoded.exp);

        // A troca de senha temporária é uma regra de autorização do servidor,
        // não apenas um modal do frontend. /me continua acessível para o SPA
        // descobrir o estado e /profile é o único caminho que pode corrigi-lo.
        if (currentUser.mustChangePassword && !isPasswordSetupRoute(req)) {
            res.status(428).json({
                message: 'Você precisa trocar sua senha antes de acessar o conteúdo.',
                mustChangePassword: true,
            });
            return;
        }

        req.user = {
            id: currentUser.id,
            username: currentUser.username ?? undefined,
            email: currentUser.email,
            role: currentUser.role,
            name: currentUser.name,
            ver: currentUser.tokenVersion,
            mustChangePassword: currentUser.mustChangePassword,
            iat: decoded.iat,
            exp: decoded.exp
        };
        next();
    } catch (error) {
        logger.error({ error, userId: decoded.id }, 'Falha ao validar a sessão no banco');
        res.status(503).json({ message: 'Serviço de autenticação temporariamente indisponível.' });
    }
};

export function verifySessionToken(token: string): JwtPayload {
    const verified = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: JWT_ALGORITHMS });
    if (!isSessionPayload(verified)) throw new jwt.JsonWebTokenError('invalid session payload');
    return verified;
}

export async function revokeSessionToken(token: string): Promise<boolean> {
    let decoded: JwtPayload;
    try {
        decoded = verifySessionToken(token);
    } catch {
        return false;
    }

    const result = await prisma.user.updateMany({
        where: { id: decoded.id, tokenVersion: decoded.ver },
        data: { tokenVersion: { increment: 1 } },
    });
    return result.count > 0;
}

export const authenticateStreamToken = (req: Request, res: Response, next: NextFunction) => {
    const token = bearerTokenFromHeader(req.headers.authorization);
    if (!token) {
        res.status(401).json({ message: 'Token de mídia não fornecido.' });
        return;
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: JWT_ALGORITHMS });
        if (!isStreamPayload(verified)) throw new jwt.JsonWebTokenError('invalid stream payload');

        const requestedVideoId = streamVideoIdFromPath(req.path);
        if (!requestedVideoId || verified.videoId !== requestedVideoId) {
            res.status(403).json({ message: 'Token de mídia não autoriza este recurso.' });
            return;
        }

        // O token de mídia expira em um minuto. Não consultar o banco em
        // cada segmento evita transformar playback HLS em uma tempestade SQL.
        req.user = verified;
        next();
    } catch {
        res.status(401).json({ message: 'Token de mídia inválido ou expirado.' });
    }
};

function isRecord(value: string | jwt.JwtPayload): value is jwt.JwtPayload {
    return typeof value === 'object' && value !== null;
}

function isRole(value: unknown): value is UserRole {
    return value === 'ADMIN' || value === 'TEACHER' || value === 'STUDENT' || value === 'STAFF' || value === 'GUARDIAN';
}

function hasBaseClaims(value: string | jwt.JwtPayload): value is jwt.JwtPayload & {
    id: string;
    role: UserRole;
    ver: number;
} {
    return isRecord(value)
        && typeof value.id === 'string'
        && UUID_PATTERN.test(value.id)
        && isRole(value.role)
        && Number.isSafeInteger(value.ver)
        && Number(value.ver) >= 0
        && Number.isSafeInteger(value.exp)
        && Number(value.exp) > 0;
}

function isSessionPayload(value: string | jwt.JwtPayload): value is JwtPayload {
    return hasBaseClaims(value) && value.purpose === undefined;
}

function isStreamPayload(value: string | jwt.JwtPayload): value is JwtPayload & {
    purpose: 'stream';
    videoId: string;
} {
    return hasBaseClaims(value)
        && value.purpose === 'stream'
        && typeof value.videoId === 'string'
        && UUID_PATTERN.test(value.videoId);
}

function streamVideoIdFromPath(requestPath: string): string | null {
    // Os arquivos gerados pelo pipeline usam somente nomes ASCII previsíveis.
    // Rejeitar escapes, barras invertidas e dot-segments impede que um token
    // de um vídeo seja reutilizado contra um diretório HLS vizinho.
    if (!requestPath.startsWith('/')
        || requestPath.includes('%')
        || requestPath.includes('\\')
        || requestPath.includes('\0')) return null;

    const parts = requestPath.split('/');
    if (parts[0] !== '' || parts.length < 3 || parts.some((part, index) => index > 0 && !part)) return null;
    if (parts.some((part) => part === '.' || part === '..')) return null;
    return UUID_PATTERN.test(parts[1]) ? parts[1] : null;
}

function isPasswordSetupRoute(req: Request): boolean {
    return req.baseUrl === '/api/auth' && (req.path === '/me' || req.path === '/profile');
}

export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ message: 'Acesso negado. Permissão insuficiente.' });
            return;
        }
        next();
    };
};
