/**
 * authMiddleware.ts — Middleware de Autenticação e Autorização
 *
 * Exporta:
 * - authenticateToken: Valida JWT no header Authorization ou query param ?token
 * - requireRole:       Verifica se o usuario logado tem a role exigida (ADMIN, TEACHER, STUDENT)
 *
 * Extende Express.Request com campo `user` tipado (JwtPayload)
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Typed JWT payload
export interface JwtPayload {
    id: string;
    username?: string;
    email: string;
    role: 'ADMIN' | 'TEACHER' | 'STUDENT';
    name: string;
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

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
        return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, (err, decoded) => {
        if (err) {
            res.status(403).json({ message: 'Token inválido ou expirado.' });
            return;
        }
        req.user = decoded as JwtPayload;
        next();
    });
};

export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ message: 'Acesso negado. Permissão insuficiente.' });
            return;
        }
        next();
    };
};
