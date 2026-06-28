import { randomInt, randomUUID } from 'node:crypto';
import type { AuditRepository, ContentRepository } from './ports.js';
import { NotFoundError, UnauthorizedError, ValidationError } from './errors.js';
import type { Branding, HeaderLink, Partner, PrivateRoom, Program } from '../domain/models.js';
import type { RequestAuditContext } from './auth-service.js';
import { hashPassword, verifyPassword } from '../infrastructure/security/password.js';
import { hashToken, randomToken } from '../infrastructure/security/tokens.js';

type ActorContext = RequestAuditContext & { userId: string };

export class ContentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly audit: AuditRepository,
  ) {}

  listNews() { return this.content.listNews(); }
  listPrograms() { return this.content.listPrograms(); }
  listPrivateRooms() { return this.content.listPrivateRooms(); }
  getBranding() { return this.content.getBranding(); }
  listPartners() { return this.content.listPartners(); }
  listHeaderLinks() { return this.content.listHeaderLinks(); }
  listAuditLogs(limit: number) { return this.audit.list(limit); }

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

  async createProgram(input: Pick<Program, 'title' | 'description' | 'video'>, actor: ActorContext) {
    const item = await this.content.createProgram(input);
    await this.record(actor, 'program.created', 'program', item.id);
    return item;
  }

  async updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video'>, actor: ActorContext) {
    const item = await this.content.updateProgram(id, input);
    if (!item) throw new NotFoundError('Programa não encontrado.');
    await this.record(actor, 'program.updated', 'program', id);
    return item;
  }

  async reorderPrograms(ids: string[], actor: ActorContext) {
    await this.validateOrder(ids, (await this.content.listPrograms()).map((item) => item.id));
    await this.content.reorderPrograms(ids);
    await this.record(actor, 'program.reordered', 'program', undefined, { ids });
  }

  async deleteProgram(id: string, actor: ActorContext) {
    if (!(await this.content.deleteProgram(id))) throw new NotFoundError('Programa não encontrado.');
    await this.record(actor, 'program.deleted', 'program', id);
  }

  async createPrivateRoom(input: Pick<PrivateRoom, 'title' | 'description' | 'sourceType' | 'sourceUrl' | 'isActive' | 'expiresAt'>, actor: ActorContext) {
    const accessPassword = generateAccessPassword();
    const room = await this.content.createPrivateRoom({
      ...input,
      roomCode: await this.generateUniquePrivateRoomCode(),
      accessPasswordHash: await hashPassword(accessPassword),
    });
    await this.record(actor, 'private_room.created', 'private_room', room.id, { roomCode: room.roomCode, sourceType: room.sourceType });
    return { room, accessPassword };
  }

  async updatePrivateRoom(id: string, input: Pick<PrivateRoom, 'title' | 'description' | 'sourceType' | 'sourceUrl' | 'isActive' | 'expiresAt'>, actor: ActorContext) {
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
    if (!rawToken) throw new UnauthorizedError('Acesso privado expirado ou ausente.');
    const room = await this.content.findPrivateRoomByAccessToken(hashToken(rawToken), normalizeRoomCode(roomCode), new Date());
    if (!room || !isPrivateRoomAvailable(room)) {
      throw new UnauthorizedError('Acesso privado expirado ou inválido.');
    }
    return sanitizePrivateRoom(room);
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
    isActive: room.isActive,
    expiresAt: room.expiresAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}
