import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { AuditRepository, ContentRepository } from './ports.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from './errors.js';
import type {
  Branding,
  HeaderLink,
  Partner,
  PrivateRoom,
  PrivateRoomInteractionSettings,
  PrivateRoomMessage,
  PrivateRoomMessageStatus,
  Program,
} from '../domain/models.js';
import type { RequestAuditContext } from './auth-service.js';
import { hashPassword, verifyPassword } from '../infrastructure/security/password.js';
import { hashToken, randomToken } from '../infrastructure/security/tokens.js';

type ActorContext = RequestAuditContext & { userId: string };
type RoleActorContext = ActorContext & { role: 'admin' | 'teacher' };
type PrivateRoomInteractionSettingsInput = Omit<PrivateRoomInteractionSettings, 'roomId' | 'updatedAt'>;
type PrivateRoomMessageInput = {
  participantName?: string | undefined;
  participantContact?: string | undefined;
  body: string;
};
type PrivateRoomMessageModerationInput = {
  status?: PrivateRoomMessageStatus | undefined;
  adminReply?: string | undefined;
  isHighlighted?: boolean | undefined;
};
type PrivateRoomSupportMaterialInput = Pick<PrivateRoom, 'supportMaterialEnabled' | 'supportMaterialTitle' | 'supportMaterialType' | 'supportMaterialUrl' | 'supportMaterialCurrentPage'>;

export class ContentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly audit: AuditRepository,
  ) {}

  listNews() { return this.content.listNews(); }
  listPrograms(params?: { search?: string | undefined; category?: string | undefined; page?: number | undefined; limit?: number | undefined }) { 
    return this.content.listPrograms(params); 
  }
  listProgramCategories() { return this.content.listProgramCategories(); }
  listPrivateRooms() { return this.content.listPrivateRooms(); }
  async listPrivateRoomsForOperator(actor: RoleActorContext) {
    return actor.role === 'admin' ? this.content.listPrivateRooms() : this.content.listPrivateRoomsForTeacher(actor.userId);
  }
  getBranding() { return this.content.getBranding(); }
  listPartners() { return this.content.listPartners(); }
  listHeaderLinks() { return this.content.listHeaderLinks(); }
  listAuditLogs(limit: number) { return this.audit.list(limit); }

  async recordOperationalStatusChange(
    serviceId: string,
    status: 'ok' | 'warning' | 'error' | 'neutral',
    previousStatus: 'ok' | 'warning' | 'error' | 'neutral' | undefined,
    detail: string,
    actor: ActorContext,
  ) {
    await this.record(
      actor,
      status === 'ok' ? 'operations.service_recovered' : 'operations.service_degraded',
      'service',
      serviceId,
      { status, previousStatus, detail },
    );
  }

  async createNews(text: string, actor: ActorContext) {
    const item = await this.content.createNews(text);
    await this.record(actor, 'news.created', 'news', item.id);
    return item;
  }

  async updateNews(id: string, text: string, actor: ActorContext) {
    const item = await this.content.updateNews(id, text);
    if (!item) throw new NotFoundError('Notícia não encontrada.');
    await this.record(actor, 'news.updated', 'news', id);
    return item;
  }

  async reorderNews(ids: string[], actor: ActorContext) {
    await this.validateOrder(ids, (await this.content.listNews()).map((item) => item.id));
    await this.content.reorderNews(ids);
    await this.record(actor, 'news.reordered', 'news', undefined, { ids });
  }

  async deleteNews(id: string, actor: ActorContext) {
    if (!(await this.content.deleteNews(id))) throw new NotFoundError('Notícia não encontrada.');
    await this.record(actor, 'news.deleted', 'news', id);
  }

  async createProgram(input: Pick<Program, 'title' | 'description' | 'video' | 'category'>, actor: ActorContext) {
    const item = await this.content.createProgram(input);
    await this.record(actor, 'program.created', 'program', item.id);
    return item;
  }

  async updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video' | 'category'>, actor: ActorContext) {
    const item = await this.content.updateProgram(id, input);
    if (!item) throw new NotFoundError('Programa não encontrado.');
    await this.record(actor, 'program.updated', 'program', id);
    return item;
  }

  async reorderPrograms(ids: string[], actor: ActorContext) {
    await this.validateOrder(ids, (await this.content.listPrograms()).items.map((item) => item.id));
    await this.content.reorderPrograms(ids);
    await this.record(actor, 'program.reordered', 'program', undefined, { ids });
  }

  async deleteProgram(id: string, actor: ActorContext) {
    if (!(await this.content.deleteProgram(id))) throw new NotFoundError('Programa não encontrado.');
    await this.record(actor, 'program.deleted', 'program', id);
  }

  async createPrivateRoom(input: Pick<PrivateRoom, 'title' | 'description' | 'sourceType' | 'sourceUrl' | 'supportMaterialEnabled' | 'supportMaterialTitle' | 'supportMaterialType' | 'supportMaterialUrl' | 'supportMaterialCurrentPage' | 'isActive' | 'expiresAt' | 'librasUrl'>, actor: ActorContext) {
    const accessPassword = generateAccessPassword();
    const room = await this.content.createPrivateRoom({
      ...input,
      roomCode: await this.generateUniquePrivateRoomCode(),
      accessPasswordHash: await hashPassword(accessPassword),
    });
    await this.record(actor, 'private_room.created', 'private_room', room.id, { roomCode: room.roomCode, sourceType: room.sourceType });
    return { room, accessPassword };
  }

  async updatePrivateRoom(id: string, input: Pick<PrivateRoom, 'title' | 'description' | 'sourceType' | 'sourceUrl' | 'supportMaterialEnabled' | 'supportMaterialTitle' | 'supportMaterialType' | 'supportMaterialUrl' | 'supportMaterialCurrentPage' | 'isActive' | 'expiresAt' | 'librasUrl'>, actor: ActorContext) {
    const room = await this.content.updatePrivateRoom(id, input);
    if (!room) throw new NotFoundError('Sala privada não encontrada.');
    await this.record(actor, 'private_room.updated', 'private_room', id, { roomCode: room.roomCode, sourceType: room.sourceType });
    return room;
  }

  async rotatePrivateRoomPassword(id: string, actor: ActorContext) {
    const accessPassword = generateAccessPassword();
    const room = await this.content.updatePrivateRoomPassword(id, await hashPassword(accessPassword));
    if (!room) throw new NotFoundError('Sala privada não encontrada.');
    await this.record(actor, 'private_room.password_rotated', 'private_room', id, { roomCode: room.roomCode });
    return { room, accessPassword };
  }

  async deletePrivateRoom(id: string, actor: ActorContext) {
    if (!(await this.content.deletePrivateRoom(id))) throw new NotFoundError('Sala privada não encontrada.');
    await this.record(actor, 'private_room.deleted', 'private_room', id);
  }

  async grantPrivateRoomAccess(roomCode: string, password: string, context: RequestAuditContext) {
    const room = await this.content.findPrivateRoomByCode(normalizeRoomCode(roomCode));
    if (!room || !isPrivateRoomAvailable(room)) {
      throw new UnauthorizedError('ID ou senha inválidos.');
    }

    const { valid } = await verifyPassword(password, room.accessPasswordHash);
    if (!valid) {
      throw new UnauthorizedError('ID ou senha inválidos.');
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await this.content.createPrivateRoomAccessSession({
      id: randomUUID(),
      roomId: room.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: new Date(),
    });
    await this.audit.append({
      action: 'private_room.access_granted',
      targetType: 'private_room',
      targetId: room.id,
      requestId: context.requestId,
      ip: context.ip,
      metadata: { roomCode: room.roomCode },
    });
    return { token, expiresAt, room: sanitizePrivateRoom(room) };
  }

  async getPrivateRoomForAccess(roomCode: string, rawToken: string | undefined) {
    const room = await this.requireAccessiblePrivateRoom(roomCode, rawToken);
    return sanitizePrivateRoom(room);
  }

  async getPrivateRoomInteractionAdmin(roomId: string) {
    await this.ensurePrivateRoomExists(roomId);
    const settings = await this.getInteractionSettings(roomId);
    const messages = await this.content.listPrivateRoomMessages(roomId, { includeArchived: false });
    return {
      settings,
      messages,
      pendingCount: messages.filter((message) => message.status === 'pending').length,
      highlightedMessage: messages.find((message) => message.isHighlighted) ?? null,
    };
  }

  async updatePrivateRoomInteractionSettings(roomId: string, input: PrivateRoomInteractionSettingsInput, actor: ActorContext) {
    await this.ensurePrivateRoomExists(roomId);
    const settings = await this.content.updatePrivateRoomInteractionSettings(roomId, input);
    await this.record(actor, 'private_room_interaction.settings_updated', 'private_room', roomId, {
      enabled: settings.enabled,
      mode: settings.mode,
      moderationRequired: settings.moderationRequired,
    });
    return settings;
  }

  async updatePrivateRoomSupportMaterial(roomId: string, input: PrivateRoomSupportMaterialInput, actor: RoleActorContext) {
    const room = await this.ensurePrivateRoomAccess(roomId, actor);
    const updated = await this.content.updatePrivateRoom(roomId, {
      title: room.title,
      description: room.description,
      sourceType: room.sourceType,
      sourceUrl: room.sourceUrl,
      supportMaterialEnabled: input.supportMaterialEnabled,
      supportMaterialTitle: input.supportMaterialTitle,
      supportMaterialType: input.supportMaterialType,
      supportMaterialUrl: input.supportMaterialUrl,
      supportMaterialCurrentPage: input.supportMaterialCurrentPage,
      isActive: room.isActive,
      expiresAt: room.expiresAt ?? null,
      librasUrl: room.librasUrl,
    });
    if (!updated) throw new NotFoundError('Sala privada não encontrada.');
    await this.record(actor, 'private_room.material_updated', 'private_room', roomId, {
      supportMaterialEnabled: updated.supportMaterialEnabled,
      supportMaterialType: updated.supportMaterialType,
      supportMaterialCurrentPage: updated.supportMaterialCurrentPage,
    });
    return updated;
  }

  async getPrivateRoomInteractionForOperator(roomId: string, actor: RoleActorContext) {
    await this.ensurePrivateRoomAccess(roomId, actor);
    return this.getPrivateRoomInteractionAdmin(roomId);
  }

  async moderatePrivateRoomMessage(id: string, input: PrivateRoomMessageModerationInput, actor: RoleActorContext) {
    const existing = await this.content.findPrivateRoomMessage(id);
    if (!existing) throw new NotFoundError('Mensagem da sala não encontrada.');
    await this.ensurePrivateRoomAccess(existing.roomId, actor);
    const nextStatus = input.status ?? existing.status;
    const nextReply = input.adminReply !== undefined ? input.adminReply.trim() : undefined;
    const nextHighlighted = this.resolveHighlightState(existing, nextStatus, input.isHighlighted);

    if (nextReply !== undefined && nextReply.length > 1000) {
      throw new ValidationError('A resposta deve ter no máximo 1000 caracteres.');
    }
    if (input.isHighlighted === true && !canHighlight(nextStatus)) {
      throw new ValidationError('Apenas mensagens aprovadas ou respondidas podem ser destacadas.');
    }

    const now = new Date();
    const message = await this.content.updatePrivateRoomMessage(id, {
      status: nextStatus,
      ...(nextReply !== undefined ? { adminReply: nextReply } : {}),
      isHighlighted: nextHighlighted,
      moderatedBy: actor.userId,
      moderatedAt: now,
    });
    if (!message) throw new NotFoundError('Mensagem da sala não encontrada.');
    await this.record(actor, 'private_room_interaction.message_moderated', 'private_room_message', id, {
      roomId: message.roomId,
      status: message.status,
      isHighlighted: message.isHighlighted,
      hasReply: Boolean(message.adminReply),
    });
    return message;
  }

  async archivePrivateRoomInteraction(roomId: string, actor: ActorContext) {
    await this.ensurePrivateRoomExists(roomId);
    await this.content.archivePrivateRoomMessages(roomId);
    await this.record(actor, 'private_room_interaction.history_archived', 'private_room', roomId);
  }

  async getPrivateRoomInteractionForAccess(roomCode: string, rawToken: string | undefined) {
    const room = await this.requireAccessiblePrivateRoom(roomCode, rawToken);
    const settings = await this.getInteractionSettings(room.id);
    if (!settings.enabled) {
      return { settings: publicInteractionSettings(settings), messages: [], highlightedMessage: null };
    }
    const messages = await this.content.listPrivateRoomMessages(room.id, { publicOnly: true });
    const publicMessages = messages.map((message) => publicMessage(message, settings));
    return {
      settings: publicInteractionSettings(settings),
      messages: publicMessages,
      highlightedMessage: publicMessages.find((message) => message.isHighlighted) ?? null,
    };
  }

  async submitPrivateRoomMessage(roomCode: string, rawToken: string | undefined, input: PrivateRoomMessageInput, context: RequestAuditContext) {
    const room = await this.requireAccessiblePrivateRoom(roomCode, rawToken);
    const settings = await this.getInteractionSettings(room.id);
    if (!settings.enabled) throw new ValidationError('A interação desta sala está desativada.');

    const body = input.body.trim();
    if (!body) throw new ValidationError('Escreva uma mensagem para enviar.');
    if (body.length > 1000) throw new ValidationError('A mensagem deve ter no máximo 1000 caracteres.');

    const submittedName = input.participantName?.trim() ?? '';
    if (settings.requireName && !settings.allowAnonymous && !submittedName) {
      throw new ValidationError('Informe seu nome para enviar.');
    }
    const participantName = submittedName || (settings.allowAnonymous ? 'Anônimo' : '');
    const participantContact = settings.collectContact ? (input.participantContact?.trim() ?? '') : '';
    if (participantName.length > 120) throw new ValidationError('O nome deve ter no máximo 120 caracteres.');
    if (participantContact.length > 180) throw new ValidationError('O contato deve ter no máximo 180 caracteres.');

    const ipHash = hashInteractionClient(context.ip ?? 'unknown');
    const minuteAgo = new Date(Date.now() - 60_000);
    if ((await this.content.countRecentPrivateRoomMessages(room.id, ipHash, minuteAgo)) >= 5) {
      throw new ValidationError('Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.');
    }
    const duplicateWindow = new Date(Date.now() - 5 * 60_000);
    if (await this.content.hasRecentDuplicatePrivateRoomMessage(room.id, ipHash, body, duplicateWindow)) {
      throw new ValidationError('Essa mensagem já foi enviada recentemente.');
    }

    const message = await this.content.createPrivateRoomMessage({
      roomId: room.id,
      participantName,
      participantContact,
      body,
      status: settings.moderationRequired ? 'pending' : 'approved',
      ipHash,
      userAgent: String(context.userAgent ?? '').slice(0, 255),
    });
    return {
      id: message.id,
      status: message.status,
      createdAt: message.createdAt,
      moderated: settings.moderationRequired,
    };
  }

  async updateBranding(input: Omit<Branding, 'updatedAt'>, actor: ActorContext) {
    const branding = await this.content.updateBranding(input);
    await this.record(actor, 'branding.updated', 'branding', 'default');
    return branding;
  }

  async createPartner(input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>, actor: ActorContext) {
    const item = await this.content.createPartner(input);
    await this.record(actor, 'partner.created', 'partner', item.id);
    return item;
  }

  async updatePartner(id: string, input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>, actor: ActorContext) {
    const item = await this.content.updatePartner(id, input);
    if (!item) throw new NotFoundError('Parceiro não encontrado.');
    await this.record(actor, 'partner.updated', 'partner', id);
    return item;
  }

  async reorderPartners(ids: string[], actor: ActorContext) {
    await this.validateOrder(ids, (await this.content.listPartners()).map((item) => item.id));
    await this.content.reorderPartners(ids);
    await this.record(actor, 'partner.reordered', 'partner', undefined, { ids });
  }

  async deletePartner(id: string, actor: ActorContext) {
    if (!(await this.content.deletePartner(id))) throw new NotFoundError('Parceiro não encontrado.');
    await this.record(actor, 'partner.deleted', 'partner', id);
  }

  async createHeaderLink(input: Pick<HeaderLink, 'name' | 'url'>, actor: ActorContext) {
    if ((await this.content.listHeaderLinks()).length >= 4) {
      throw new ValidationError('O cabeçalho aceita no máximo quatro botões.');
    }
    const item = await this.content.createHeaderLink(input);
    await this.record(actor, 'header_link.created', 'header_link', item.id);
    return item;
  }

  async updateHeaderLink(id: string, input: Pick<HeaderLink, 'name' | 'url'>, actor: ActorContext) {
    const item = await this.content.updateHeaderLink(id, input);
    if (!item) throw new NotFoundError('Botão do cabeçalho não encontrado.');
    await this.record(actor, 'header_link.updated', 'header_link', id);
    return item;
  }

  async reorderHeaderLinks(ids: string[], actor: ActorContext) {
    await this.validateOrder(ids, (await this.content.listHeaderLinks()).map((item) => item.id));
    await this.content.reorderHeaderLinks(ids);
    await this.record(actor, 'header_link.reordered', 'header_link', undefined, { ids });
  }

  async deleteHeaderLink(id: string, actor: ActorContext) {
    if (!(await this.content.deleteHeaderLink(id))) throw new NotFoundError('Botão do cabeçalho não encontrado.');
    await this.record(actor, 'header_link.deleted', 'header_link', id);
  }

  private async ensurePrivateRoomExists(roomId: string) {
    const room = await this.content.findPrivateRoomById(roomId);
    if (!room) throw new NotFoundError('Sala privada não encontrada.');
    return room;
  }

  private async ensurePrivateRoomAccess(roomId: string, actor: RoleActorContext) {
    const room = await this.ensurePrivateRoomExists(roomId);
    if (actor.role === 'admin') return room;
    if (!(await this.content.userCanAccessPrivateRoom(actor.userId, roomId))) {
      throw new ForbiddenError('Professor sem acesso a esta sala privada.');
    }
    return room;
  }

  private async getInteractionSettings(roomId: string): Promise<PrivateRoomInteractionSettings> {
    return (await this.content.getPrivateRoomInteractionSettings(roomId)) ?? defaultInteractionSettings(roomId);
  }

  private async requireAccessiblePrivateRoom(roomCode: string, rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedError('Acesso privado expirado ou ausente.');
    const room = await this.content.findPrivateRoomByAccessToken(hashToken(rawToken), normalizeRoomCode(roomCode), new Date());
    if (!room || !isPrivateRoomAvailable(room)) {
      throw new UnauthorizedError('Acesso privado expirado ou inválido.');
    }
    return room;
  }

  private resolveHighlightState(
    existing: Pick<PrivateRoomMessage, 'isHighlighted'>,
    status: PrivateRoomMessageStatus,
    requested: boolean | undefined,
  ) {
    if (!canHighlight(status)) return false;
    return requested ?? existing.isHighlighted;
  }

  private async validateOrder(ids: string[], existingIds: string[]) {
    const uniqueIds = new Set(ids);
    if (ids.length !== existingIds.length || uniqueIds.size !== ids.length || ids.some((id) => !existingIds.includes(id))) {
      throw new ValidationError('A ordenação deve conter todos os itens atuais exatamente uma vez.');
    }
  }

  private record(actor: ActorContext, action: string, targetType: string, targetId?: string, metadata?: Record<string, unknown>) {
    return this.audit.append({
      actorUserId: actor.userId,
      action,
      targetType,
      targetId,
      requestId: actor.requestId,
      ip: actor.ip,
      metadata,
    });
  }

  private async generateUniquePrivateRoomCode() {
    for (let attempts = 0; attempts < 10; attempts += 1) {
      const code = String(randomInt(100000, 1000000));
      if (!(await this.content.findPrivateRoomByCode(code))) return code;
    }
    throw new ValidationError('Não foi possível gerar um ID único para a sala. Tente novamente.');
  }
}

function generateAccessPassword() {
  return randomToken().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

function defaultInteractionSettings(roomId: string): PrivateRoomInteractionSettings {
  return {
    roomId,
    enabled: true,
    mode: 'questions_comments',
    requireName: true,
    allowAnonymous: false,
    collectContact: false,
    moderationRequired: true,
    allowPublicReplies: true,
    noticeText: 'Envie suas perguntas e comentários para a moderação.',
    updatedAt: new Date(0),
  };
}

function canHighlight(status: PrivateRoomMessageStatus) {
  return status === 'approved' || status === 'answered';
}

function publicInteractionSettings(settings: PrivateRoomInteractionSettings) {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    requireName: settings.requireName,
    allowAnonymous: settings.allowAnonymous,
    collectContact: settings.collectContact,
    moderationRequired: settings.moderationRequired,
    allowPublicReplies: settings.allowPublicReplies,
    noticeText: settings.noticeText,
  };
}

function publicMessage(message: PrivateRoomMessage, settings: PrivateRoomInteractionSettings) {
  return {
    id: message.id,
    participantName: message.participantName,
    body: message.body,
    adminReply: settings.allowPublicReplies ? message.adminReply : '',
    status: message.status,
    isHighlighted: message.isHighlighted,
    createdAt: message.createdAt,
  };
}

function hashInteractionClient(value: string) {
  return createHash('sha256').update(`private-room-interaction:${value}`).digest('hex');
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function isPrivateRoomAvailable(room: Pick<PrivateRoom, 'isActive' | 'expiresAt'>) {
  return room.isActive && (!room.expiresAt || room.expiresAt.getTime() > Date.now());
}

function sanitizePrivateRoom(room: PrivateRoom) {
  return {
    id: room.id,
    roomCode: room.roomCode,
    title: room.title,
    description: room.description,
    sourceType: room.sourceType,
    sourceUrl: room.sourceUrl,
    supportMaterialEnabled: room.supportMaterialEnabled,
    supportMaterialTitle: room.supportMaterialTitle,
    supportMaterialType: room.supportMaterialType,
    supportMaterialUrl: room.supportMaterialUrl,
    supportMaterialCurrentPage: room.supportMaterialCurrentPage,
    isActive: room.isActive,
    expiresAt: room.expiresAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    librasUrl: room.librasUrl,
  };
}
