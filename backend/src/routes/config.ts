/**
 * config.ts — Configurações Globais da Plataforma (Branding)
 *
 * Endpoints:
 * - GET /public → Retorna nome, cor primária e logoUrl públicos para todos (sem req. de auth)
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Cache em memória para config pública (evita query a cada refresh de aluno)
let configCache: { data: Record<string, unknown>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

export function invalidateConfigCache() {
    configCache = null;
}

// ============================================================
// CONFIGURAÇÕES PÚBLICAS (Branding no Login e App global)
// ============================================================
router.get('/public', async (req: Request, res: Response): Promise<void> => {
    try {
        const now = Date.now();
        if (configCache && configCache.expiresAt > now) {
            res.json(configCache.data);
            return;
        }

        // Tenta buscar a config. Como só deve ter uma linha na tabela, pega a primeira
        let config = await prisma.platformConfig.findFirst();

        // Se o banco for virgem, cria os padrões em tempo real
        if (!config) {
            config = await prisma.platformConfig.create({
                data: {
                    platformName: 'EduVault',
                    primaryColor: '#6366f1',
                    accentColor: '#ec4899',
                    logoUrl: null
                }
            });
        }

        const result = {
            platformName: config.platformName,
            namePart1: config.namePart1,
            namePart2: config.namePart2,
            nameColor1: config.nameColor1,
            nameColor2: config.nameColor2,
            primaryColor: config.primaryColor,
            accentColor: config.accentColor,
            logoUrl: config.logoUrl,
            bannerUrl: config.bannerUrl,
            forumPunishmentEnabled: config.forumPunishmentEnabled,
            attendanceEnabled: config.attendanceEnabled
        };

        configCache = { data: result, expiresAt: now + CACHE_TTL_MS };
        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar config pública:', error);
        res.status(500).json({ message: 'Erro interno ao buscar configurações' });
    }
});

export default router;
