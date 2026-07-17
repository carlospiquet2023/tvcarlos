import type { ForumBan, ViolationSeverity } from '@prisma/client';
import prisma from '../../lib/prisma';

export type ForumBanStatus =
    | { banned: true; ban: ForumBan }
    | { banned: false; ban: null };

export async function checkForumBan(userId: string): Promise<ForumBanStatus> {
    const activeBan = await prisma.forumBan.findFirst({
        where: {
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
    });
    return activeBan ? { banned: true, ban: activeBan } : { banned: false, ban: null };
}

export async function recordForumViolation(
    userId: string,
    severity: ViolationSeverity,
    word: string,
    messageText: string,
): Promise<{ action: string; message: string }> {
    return prisma.$transaction(async (tx) => {
        const [config, violationCount] = await Promise.all([
            tx.platformConfig.findFirst({ select: { forumPunishmentEnabled: true } }),
            tx.forumViolation.count({ where: { userId } }),
        ]);
        const violationNumber = violationCount + 1;
        let action = 'NONE';
        let banType: 'TEMP_1D' | 'TEMP_2D' | 'TEMP_10D' | 'PERMANENT' | null = null;
        let banDays: number | null = null;
        let publicMessage = `Violação registrada: uso do termo "${word}". Sua mensagem foi bloqueada.`;

        if (config?.forumPunishmentEnabled) {
            if (severity === 'SEVERE') {
                action = 'BAN_10D';
                banType = 'TEMP_10D';
                banDays = 10;
                publicMessage = 'Violação grave detectada. Seu acesso ao fórum foi suspenso por 10 dias. Você pode enviar um recurso pelo painel.';
            } else if (severity === 'MEDIUM' || violationNumber >= 4) {
                if (violationNumber >= 5) {
                    action = 'BAN_PERMANENT';
                    banType = 'PERMANENT';
                    publicMessage = 'Seu acesso ao fórum foi suspenso por reincidência. Você pode enviar um recurso pelo painel.';
                } else {
                    action = 'BAN_2D';
                    banType = 'TEMP_2D';
                    banDays = 2;
                    publicMessage = 'Violação detectada. Seu acesso ao fórum foi suspenso por 2 dias. Você pode enviar um recurso pelo painel.';
                }
            } else if (violationNumber >= 3) {
                action = 'BAN_1D';
                banType = 'TEMP_1D';
                banDays = 1;
                publicMessage = 'Terceira violação registrada. Seu acesso ao fórum foi suspenso por 1 dia. Você pode enviar um recurso pelo painel.';
            } else {
                action = 'WARNING';
                publicMessage = `Mensagem bloqueada por conteúdo inadequado. Esta é sua ${violationNumber}ª violação; reincidências podem suspender o fórum.`;
            }
        }

        await tx.forumViolation.create({
            data: { userId, word, severity, message: messageText, autoAction: action },
        });
        if (banType) {
            const expiresAt = banDays ? new Date(Date.now() + banDays * 24 * 60 * 60 * 1000) : null;
            await tx.forumBan.create({
                data: { userId, reason: `Moderação automática (${severity})`, banType, expiresAt },
            });
        }
        return { action, message: publicMessage };
    });
}
