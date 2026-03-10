/**
 * auth.ts — Rotas de Autenticação e Perfil
 *
 * Endpoints:
 * - POST /login          → Autentica por username ou e-mail, retorna JWT (24h)
 * - GET  /me             → Retorna dados do usuário logado (validação de sessão)
 * - PUT  /profile        → Altera username e/ou senha (requer senha atual)
 * - GET  /stream-token   → Gera JWT de curta duração (5min) para streaming HLS
 *
 * Segurança: bcrypt (12 rounds), JWT assinado com JWT_SECRET do .env
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/authMiddleware';
import prisma from '../lib/prisma';

const router = Router();

// Login endpoint - aceita username ou email
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const { login, email, password } = req.body;

        // Suporte a campo 'login' (username ou email) ou campo 'email' direto
        const identifier = login || email;
        if (!identifier || !password) {
            res.status(400).json({ message: 'Usuário/email e senha são obrigatórios.' });
            return;
        }

        // Busca por username OU email
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: identifier },
                    { email: identifier }
                ]
            }
        });

        if (!user) {
            res.status(401).json({ message: 'Credenciais inválidas.' });
            return;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            res.status(401).json({ message: 'Credenciais inválidas.' });
            return;
        }

        // Gerar token
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro interno no servidor' });
    }
});

// Get current user profile
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, name: true, email: true, role: true, createdAt: true }
        });

        if (!user) {
            res.status(404).json({ message: 'Usuário não encontrado' });
            return;
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor' });
    }
});

// Atualizar credenciais do próprio perfil (username e/ou senha)
router.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { currentPassword, newUsername, newPassword } = req.body;

        if (!currentPassword) {
            res.status(400).json({ message: 'Senha atual é obrigatória para alterar credenciais.' });
            return;
        }

        // Validar senha atual
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            res.status(404).json({ message: 'Usuário não encontrado.' });
            return;
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            res.status(401).json({ message: 'Senha atual incorreta.' });
            return;
        }

        // Preparar dados para atualização
        const updateData: Record<string, unknown> = {};

        if (newUsername && newUsername !== user.username) {
            // Verificar se username já existe
            const existingUser = await prisma.user.findUnique({ where: { username: newUsername } });
            if (existingUser) {
                res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
                return;
            }
            updateData.username = newUsername;
        }

        if (newPassword) {
            if (newPassword.length < 8) {
                res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' });
                return;
            }
            if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
                res.status(400).json({ message: 'A senha deve conter letras maiúsculas, minúsculas e números.' });
                return;
            }
            updateData.password = await bcrypt.hash(newPassword, 12);
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'Nenhuma alteração informada.' });
            return;
        }

        // Atualizar no banco
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, username: true, name: true, email: true, role: true }
        });

        // Gerar novo token com dados atualizados
        const newToken = jwt.sign(
            { id: updatedUser.id, username: updatedUser.username, email: updatedUser.email, role: updatedUser.role, name: updatedUser.name },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Credenciais atualizadas com sucesso!',
            token: newToken,
            user: updatedUser
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar credenciais.' });
    }
});

// ISSUE-03: Token de streaming curto (5 min) para mitigar exposição na URL
router.get('/stream-token', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const streamToken = jwt.sign(
            { id: req.user!.id, email: req.user!.email, role: req.user!.role, name: req.user!.name, purpose: 'stream' },
            process.env.JWT_SECRET as string,
            { expiresIn: '5m' }
        );
        res.json({ streamToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao gerar token de streaming.' });
    }
});

export default router;
