import { isEmailConfigured } from '../../lib/email';
import logger from '../../lib/logger';
import prisma from '../../lib/prisma';
import { isDeliverableEmailAddress } from './studentImport';

export interface EmailDeliveryStatus {
    configured: boolean;
    sent: boolean;
}

/** Auditoria best-effort: a indisponibilidade do log não desfaz a ação principal. */
export async function auditLog(
    userId: string,
    action: string,
    target: string,
    details?: string,
): Promise<void> {
    try {
        await prisma.auditLog.create({ data: { userId, action, target, details } });
    } catch (error) {
        logger.error(error, 'Falha ao registrar audit log');
    }
}

/** Envio best-effort com o contrato de status usado pelas rotas administrativas. */
export async function attemptEmailDelivery(
    send: () => Promise<void>,
    context: Record<string, unknown>,
    recipient?: string,
): Promise<EmailDeliveryStatus> {
    if (!isEmailConfigured()) return { configured: false, sent: false };
    if (recipient && !isDeliverableEmailAddress(recipient)) {
        return { configured: true, sent: false };
    }
    try {
        await send();
        return { configured: true, sent: true };
    } catch (error) {
        logger.error({ error, ...context }, 'Falha ao entregar e-mail');
        return { configured: true, sent: false };
    }
}
