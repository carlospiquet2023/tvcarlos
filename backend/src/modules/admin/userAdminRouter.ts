import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole } from '../../middleware/authMiddleware';
import { sendStudentCredentialsEmail } from '../../lib/email';
import prisma from '../../lib/prisma';
import { attemptEmailDelivery, auditLog } from './adminSupport';
import {
    isSelfTarget,
    isValidUserRole,
    parseUserListQuery,
    passwordValidationMessage,
    VALID_USER_ROLES,
} from './userAdminPolicy';

const userAdminRouter = Router();

userAdminRouter.use(authenticateToken, requireRole(['ADMIN']));

userAdminRouter.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, search, skip } = parseUserListQuery(req.query);
        const where = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
            ],
        } : {};

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    accessBlocked: true,
                    accessBlockedAt: true,
                    accessBlockedReason: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.user.count({ where }),
        ]);

        res.json({ data: users, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar usuários.' });
    }
});

userAdminRouter.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
            return;
        }

        const userRole = role || 'STUDENT';
        if (!isValidUserRole(userRole)) {
            res.status(400).json({
                message: `Role inválida. Valores aceitos: ${VALID_USER_ROLES.join(', ')}`,
            });
            return;
        }

        const passwordError = passwordValidationMessage(password);
        if (passwordError) {
            res.status(400).json({ message: passwordError });
            return;
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ message: 'Este e-mail já está cadastrado no sistema.' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: userRole },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                accessBlocked: true,
                accessBlockedAt: true,
                accessBlockedReason: true,
                createdAt: true,
            },
        });

        await auditLog(req.user!.id, 'CREATE_USER', user.id, `Criou usuário ${name} (${email})`);
        const emailDelivery = await attemptEmailDelivery(() => sendStudentCredentialsEmail({
            to: user.email,
            studentName: user.name,
            login: user.email,
            password,
        }), { action: 'CREATE_USER', userId: user.id }, user.email);
        res.status(201).json({ ...user, emailDelivery });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar usuário.' });
    }
});

userAdminRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { name, email, role, password } = req.body;

        if (role && !isValidUserRole(role)) {
            res.status(400).json({
                message: `Role inválida. Valores aceitos: ${VALID_USER_ROLES.join(', ')}`,
            });
            return;
        }

        const data: Record<string, unknown> = {};
        if (name) data.name = name;
        if (email) data.email = email;
        if (role) data.role = role;
        if (password) {
            const passwordError = passwordValidationMessage(password);
            if (passwordError) {
                res.status(400).json({ message: passwordError });
                return;
            }
            data.password = await bcrypt.hash(password, 12);
            data.passwordChangedAt = new Date();
            data.mustChangePassword = true;
            data.tokenVersion = { increment: 1 };
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                accessBlocked: true,
                accessBlockedAt: true,
                accessBlockedReason: true,
                createdAt: true,
            },
        });

        await auditLog(
            req.user!.id,
            'UPDATE_USER',
            user.id,
            `Atualizou o usuário ${user.email}${password ? ' e redefiniu a senha' : ''}`,
        );
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar usuário.' });
    }
});

userAdminRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        if (isSelfTarget(req.user!.id, id)) {
            res.status(403).json({ message: 'Não é possível remover sua própria conta.' });
            return;
        }

        await prisma.$transaction([
            prisma.videoHistory.deleteMany({ where: { userId: id } }),
            prisma.courseEnrollment.deleteMany({ where: { userId: id } }),
            prisma.user.delete({ where: { id } }),
        ]);

        await auditLog(req.user!.id, 'DELETE_USER', id, `Removeu usuário ${id}`);
        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao remover usuário.' });
    }
});

export default userAdminRouter;
