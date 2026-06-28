import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from '../../src/application/content-service.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../src/application/errors.js';
import type { AuditRepository, ContentRepository } from '../../src/application/ports.js';
import {
  DEFAULT_BRANDING,
  type HeaderLink,
  type NewsItem,
  type Partner,
  type PrivateRoom,
  type PrivateRoomInteractionSettings,
  type PrivateRoomMessage,
  type Program,
} from '../../src/domain/models.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

const now = new Date('2026-01-01T00:00:00Z');
const actor = { userId: 'user-1', role: 'admin' as const, requestId: 'request-1', ip: '127.0.0.1' };
const news = (id: string): NewsItem => ({ id, text: `Notícia ${id}`, position: 0, createdAt: now });
const program = (id: string): Program => ({ id, title: `Programa ${id}`, description: 'Descrição', video: 'video.mp4', category: null, position: 0, createdAt: now });
const partner = (id: string): Partner => ({ id, name: `Parceiro ${id}`, logoUrl: 'https://example.com/logo.png', destinationUrl: '', position: 0, createdAt: now });
const link = (id: string): HeaderLink => ({ id, name: `Link ${id}`, url: 'https://example.com', position: 0, createdAt: now });
const privateRoom = (id: string): PrivateRoom => ({
  id,
  roomCode: '123456',
  title: `Sala ${id}`,
  description: 'Conteúdo restrito',
  sourceType: 'youtube',
  sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
  supportMaterialEnabled: false,
  supportMaterialTitle: 'Material de apoio',
  supportMaterialType: 'url',
  supportMaterialUrl: '',
  supportMaterialCurrentPage: 1,
  isActive: true,
  expiresAt: null,
  createdAt: now,
  updatedAt: now,
});
const interactionSettings = (roomId = 'vip1'): PrivateRoomInteractionSettings => ({
  roomId,
  enabled: true,
  mode: 'questions_comments',
  requireName: true,
  allowAnonymous: false,
  collectContact: false,
  moderationRequired: true,
  allowPublicReplies: true,
  noticeText: 'Envie suas perguntas.',
  updatedAt: now,
});
const privateRoomMessage = (id = 'msg1'): PrivateRoomMessage => ({
  id,
  roomId: 'vip1',
  participantName: 'Cliente',
  participantContact: '',
  body: 'Qual é o horário?',
  adminReply: '',
  status: 'pending',
  isHighlighted: false,
  ipHash: 'hash',
  userAgent: 'Vitest',
  moderatedBy: null,
  moderatedAt: null,
  createdAt: now,
  updatedAt: now,
});

function repositoryMock() {
  return {
    hasContent: vi.fn(async () => true),
    listNews: vi.fn(async () => [news('n1'), news('n2')]),
    createNews: vi.fn(async (text: string) => ({ ...news('n3'), text })),
    updateNews: vi.fn(async (id: string, text: string) => ({ ...news(id), text })),
    reorderNews: vi.fn(async () => undefined),
    deleteNews: vi.fn(async () => true),
    listPrograms: vi.fn(async () => ({ items: [program('p1'), program('p2')], total: 2 })),
    listProgramCategories: vi.fn(async () => []),
    createProgram: vi.fn(async (input: Pick<Program, 'title' | 'description' | 'video' | 'category'>) => ({ ...program('p3'), ...input })),
    updateProgram: vi.fn(async (id: string, input: Pick<Program, 'title' | 'description' | 'video' | 'category'>) => ({ ...program(id), ...input })),
    reorderPrograms: vi.fn(async () => undefined),
    deleteProgram: vi.fn(async () => true),
    listPrivateRooms: vi.fn(async () => [privateRoom('vip1')]),
    listPrivateRoomsForTeacher: vi.fn(async () => [privateRoom('vip1')]),
    userCanAccessPrivateRoom: vi.fn(async () => true),
    findPrivateRoomById: vi.fn(async (id: string) => privateRoom(id)),
    findPrivateRoomByCode: vi.fn(async () => undefined),
    createPrivateRoom: vi.fn(async (input) => ({ ...privateRoom('vip3'), ...input })),
    updatePrivateRoom: vi.fn(async (id: string, input) => ({ ...privateRoom(id), ...input })),
    updatePrivateRoomPassword: vi.fn(async (id: string) => privateRoom(id)),
    deletePrivateRoom: vi.fn(async () => true),
    createPrivateRoomAccessSession: vi.fn(async () => undefined),
    findPrivateRoomByAccessToken: vi.fn(async () => privateRoom('vip1')),
    deleteExpiredPrivateRoomAccessSessions: vi.fn(async () => undefined),
    getPrivateRoomInteractionSettings: vi.fn(async () => undefined),
    updatePrivateRoomInteractionSettings: vi.fn(async (roomId, input) => ({ roomId, ...input, updatedAt: now })),
    listPrivateRoomMessages: vi.fn(async () => []),
    findPrivateRoomMessage: vi.fn(async () => undefined),
    createPrivateRoomMessage: vi.fn(async (input) => ({
      id: 'msg1',
      ...input,
      adminReply: '',
      isHighlighted: false,
      createdAt: now,
      updatedAt: now,
    })),
    updatePrivateRoomMessage: vi.fn(async () => undefined),
    archivePrivateRoomMessages: vi.fn(async () => undefined),
    countRecentPrivateRoomMessages: vi.fn(async () => 0),
    hasRecentDuplicatePrivateRoomMessage: vi.fn(async () => false),
    getBranding: vi.fn(async () => ({ ...DEFAULT_BRANDING, updatedAt: now })),
    updateBranding: vi.fn(async (input) => ({ ...input, updatedAt: now })),
    listPartners: vi.fn(async () => [partner('r1'), partner('r2')]),
    createPartner: vi.fn(async (input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>) => ({ ...partner('r3'), ...input })),
    updatePartner: vi.fn(async (id: string, input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>) => ({ ...partner(id), ...input })),
    reorderPartners: vi.fn(async () => undefined),
    deletePartner: vi.fn(async () => true),
    listHeaderLinks: vi.fn(async () => [link('h1'), link('h2')]),
    createHeaderLink: vi.fn(async (input: Pick<HeaderLink, 'name' | 'url'>) => ({ ...link('h3'), ...input })),
    updateHeaderLink: vi.fn(async (id: string, input: Pick<HeaderLink, 'name' | 'url'>) => ({ ...link(id), ...input })),
    reorderHeaderLinks: vi.fn(async () => undefined),
    deleteHeaderLink: vi.fn(async () => true),
    createMedia: vi.fn(async () => undefined),
  } satisfies ContentRepository;
}

describe('ContentService', () => {
  let content: ReturnType<typeof repositoryMock>;
  let audit: { list: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn> };
  let service: ContentService;

  beforeEach(() => {
    content = repositoryMock();
    audit = { list: vi.fn(async () => []), append: vi.fn(async () => undefined) };
    service = new ContentService(content, audit as AuditRepository);
  });

  it('delegates public reads without exposing persistence details', async () => {
    await expect(service.listNews()).resolves.toHaveLength(2);
    const programs = await service.listPrograms();
    expect(programs.items).toHaveLength(2);
    await expect(service.listPartners()).resolves.toHaveLength(2);
    await expect(service.listHeaderLinks()).resolves.toHaveLength(2);
    await expect(service.listPrivateRooms()).resolves.toHaveLength(1);
    await expect(service.getBranding()).resolves.toMatchObject({ companyName: 'TV Carlos' });
    await expect(service.listAuditLogs(30)).resolves.toEqual([]);
    expect(audit.list).toHaveBeenCalledWith(30);
  });

  it('audits operational health transitions for maintenance', async () => {
    await service.recordOperationalStatusChange('database', 'error', undefined, 'Banco indisponível', actor);
    await service.recordOperationalStatusChange('database', 'ok', 'error', 'Banco recuperado', actor);

    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'operations.service_degraded',
      targetType: 'service',
      targetId: 'database',
      metadata: { status: 'error', previousStatus: undefined, detail: 'Banco indisponível' },
    }));
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'operations.service_recovered',
      targetType: 'service',
      targetId: 'database',
      metadata: { status: 'ok', previousStatus: 'error', detail: 'Banco recuperado' },
    }));
  });

  it('executes and audits the complete content lifecycle', async () => {
    await service.createNews('Nova notícia', actor);
    await service.updateNews('n1', 'Atualizada', actor);
    await service.reorderNews(['n2', 'n1'], actor);
    await service.deleteNews('n1', actor);

    const programInput = { title: 'Jornal', description: 'Ao vivo', video: 'jornal.mp4' };
    await service.createProgram(programInput, actor);
    await service.updateProgram('p1', programInput, actor);
    await service.reorderPrograms(['p2', 'p1'], actor);
    await service.deleteProgram('p1', actor);

    const roomInput = {
      title: 'Sala VIP',
      description: 'Cliente A',
      sourceType: 'youtube' as const,
      sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
      supportMaterialEnabled: true,
      supportMaterialTitle: 'Slides da aula',
      supportMaterialType: 'pdf' as const,
      supportMaterialUrl: '/documents/aula.pdf',
      supportMaterialCurrentPage: 3,
      isActive: true,
      expiresAt: null,
    };
    const createdRoom = await service.createPrivateRoom(roomInput, actor);
    await service.updatePrivateRoom('vip1', roomInput, actor);
    await service.rotatePrivateRoomPassword('vip1', actor);
    await service.deletePrivateRoom('vip1', actor);

    const partnerInput = { name: 'Marca', logoUrl: 'https://example.com/marca.png', destinationUrl: 'https://example.com' };
    await service.createPartner(partnerInput, actor);
    await service.updatePartner('r1', partnerInput, actor);
    await service.reorderPartners(['r2', 'r1'], actor);
    await service.deletePartner('r1', actor);

    const linkInput = { name: 'Notícias', url: 'noticias.html' };
    await service.createHeaderLink(linkInput, actor);
    await service.updateHeaderLink('h1', linkInput, actor);
    await service.reorderHeaderLinks(['h2', 'h1'], actor);
    await service.deleteHeaderLink('h1', actor);
    await service.updateBranding(DEFAULT_BRANDING, actor);

    expect(createdRoom.accessPassword).toHaveLength(10);
    expect(content.createPrivateRoom).toHaveBeenCalledWith(expect.objectContaining({
      accessPasswordHash: expect.stringContaining('$argon2id$'),
      roomCode: expect.stringMatching(/^\d{6}$/),
    }));
    expect(audit.append).toHaveBeenCalledTimes(21);
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: actor.userId,
      action: 'header_link.reordered',
      metadata: { ids: ['h2', 'h1'] },
    }));
  });

  it('rejects a reordering with missing, unknown or duplicated ids', async () => {
    await expect(service.reorderNews(['n1'], actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.reorderNews(['n1', 'unknown'], actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.reorderNews(['n1', 'n1'], actor)).rejects.toBeInstanceOf(ValidationError);
    expect(content.reorderNews).not.toHaveBeenCalled();
  });

  it('enforces the four-button header limit before writing', async () => {
    content.listHeaderLinks.mockResolvedValue([link('1'), link('2'), link('3'), link('4')]);
    await expect(service.createHeaderLink({ name: 'Quinto', url: 'https://example.com/5' }, actor))
      .rejects.toThrow('no máximo quatro botões');
    expect(content.createHeaderLink).not.toHaveBeenCalled();
  });

  it('translates missing updates into domain-level not-found errors', async () => {
    content.updateNews.mockResolvedValue(undefined);
    content.updateProgram.mockResolvedValue(undefined);
    content.updatePartner.mockResolvedValue(undefined);
    content.updateHeaderLink.mockResolvedValue(undefined);
    content.updatePrivateRoom.mockResolvedValue(undefined);
    content.updatePrivateRoomPassword.mockResolvedValue(undefined);
    await expect(service.updateNews('x', 'texto', actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateProgram('x', { title: 'x', description: '', video: 'x.mp4' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updatePartner('x', { name: 'x', logoUrl: 'https://example.com/x.png', destinationUrl: '' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateHeaderLink('x', { name: 'x', url: 'x.html' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updatePrivateRoom('x', {
      title: 'x',
      description: '',
      sourceType: 'live',
      sourceUrl: '',
      supportMaterialEnabled: false,
      supportMaterialTitle: 'Material de apoio',
      supportMaterialType: 'url',
      supportMaterialUrl: '',
      supportMaterialCurrentPage: 1,
      isActive: true,
      expiresAt: null,
    }, actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.rotatePrivateRoomPassword('x', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('translates missing deletes into domain-level not-found errors', async () => {
    content.deleteNews.mockResolvedValue(false);
    content.deleteProgram.mockResolvedValue(false);
    content.deletePartner.mockResolvedValue(false);
    content.deleteHeaderLink.mockResolvedValue(false);
    content.deletePrivateRoom.mockResolvedValue(false);
    await expect(service.deleteNews('x', actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteProgram('x', actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deletePartner('x', actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteHeaderLink('x', actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deletePrivateRoom('x', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('grants private room access with hashed password and creates a short-lived session', async () => {
    content.findPrivateRoomByCode.mockResolvedValue({ ...privateRoom('vip1'), roomCode: '123456', accessPasswordHash: await hashPassword('segredo-forte') });

    const access = await service.grantPrivateRoomAccess(' 123456 ', 'segredo-forte', actor);
    expect(access.room).toMatchObject({ roomCode: '123456', title: 'Sala vip1' });
    expect(access.token).toHaveLength(43);
    expect(content.createPrivateRoomAccessSession).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'vip1',
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    }));
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'private_room.access_granted',
      targetId: 'vip1',
      metadata: { roomCode: '123456' },
    }));

    await expect(service.getPrivateRoomForAccess('123456', access.token)).resolves.toMatchObject({ id: 'vip1' });
    expect(content.findPrivateRoomByAccessToken).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), '123456', expect.any(Date));
  });

  it('rejects invalid, inactive or expired private room access', async () => {
    content.findPrivateRoomByCode.mockResolvedValue(undefined);
    await expect(service.grantPrivateRoomAccess('123456', 'senha', actor)).rejects.toBeInstanceOf(UnauthorizedError);

    content.findPrivateRoomByCode.mockResolvedValue({ ...privateRoom('vip1'), isActive: false, accessPasswordHash: await hashPassword('senha') });
    await expect(service.grantPrivateRoomAccess('123456', 'senha', actor)).rejects.toBeInstanceOf(UnauthorizedError);

    content.findPrivateRoomByCode.mockResolvedValue({ ...privateRoom('vip1'), expiresAt: new Date('2020-01-01T00:00:00Z'), accessPasswordHash: await hashPassword('senha') });
    await expect(service.grantPrivateRoomAccess('123456', 'senha', actor)).rejects.toBeInstanceOf(UnauthorizedError);

    content.findPrivateRoomByCode.mockResolvedValue({ ...privateRoom('vip1'), accessPasswordHash: await hashPassword('senha-correta') });
    await expect(service.grantPrivateRoomAccess('123456', 'errada', actor)).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(service.getPrivateRoomForAccess('123456', undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    content.findPrivateRoomByAccessToken.mockResolvedValue(undefined);
    await expect(service.getPrivateRoomForAccess('123456', 'token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns private room interaction state for admin with default settings', async () => {
    content.listPrivateRoomMessages.mockResolvedValue([
      privateRoomMessage('msg1'),
      { ...privateRoomMessage('msg2'), status: 'approved', isHighlighted: true },
    ]);

    const interaction = await service.getPrivateRoomInteractionAdmin('vip1');

    expect(interaction.settings).toMatchObject({ enabled: true, mode: 'questions_comments', roomId: 'vip1' });
    expect(interaction.pendingCount).toBe(1);
    expect(interaction.highlightedMessage).toMatchObject({ id: 'msg2' });
    expect(content.findPrivateRoomById).toHaveBeenCalledWith('vip1');
  });

  it('updates, audits and archives private room interaction settings', async () => {
    const input = {
      enabled: true,
      mode: 'questions_only' as const,
      requireName: false,
      allowAnonymous: true,
      collectContact: true,
      moderationRequired: false,
      allowPublicReplies: false,
      noticeText: 'Perguntas da aula',
    };

    await expect(service.updatePrivateRoomInteractionSettings('vip1', input, actor)).resolves.toMatchObject(input);
    await service.archivePrivateRoomInteraction('vip1', actor);

    expect(content.updatePrivateRoomInteractionSettings).toHaveBeenCalledWith('vip1', input);
    expect(content.archivePrivateRoomMessages).toHaveBeenCalledWith('vip1');
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'private_room_interaction.settings_updated',
      targetId: 'vip1',
      metadata: expect.objectContaining({ mode: 'questions_only' }),
    }));
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'private_room_interaction.history_archived',
      targetId: 'vip1',
    }));
  });

  it('submits private room messages with moderation, anonymity, contact and anti-spam controls', async () => {
    content.findPrivateRoomByAccessToken.mockResolvedValue(privateRoom('vip1'));
    content.getPrivateRoomInteractionSettings.mockResolvedValue({
      ...interactionSettings('vip1'),
      requireName: false,
      allowAnonymous: true,
      collectContact: true,
      moderationRequired: false,
    });

    const result = await service.submitPrivateRoomMessage(
      '123456',
      'token',
      { body: 'Pergunta enviada', participantContact: 'cliente@example.com' },
      { ip: '203.0.113.10', userAgent: 'Vitest' },
    );

    expect(result).toMatchObject({ status: 'approved', moderated: false });
    expect(content.createPrivateRoomMessage).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'vip1',
      participantName: 'Anônimo',
      participantContact: 'cliente@example.com',
      body: 'Pergunta enviada',
      status: 'approved',
      ipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      userAgent: 'Vitest',
    }));

    content.countRecentPrivateRoomMessages.mockResolvedValue(5);
    await expect(service.submitPrivateRoomMessage('123456', 'token', { body: 'Outra' }, { ip: '203.0.113.10' }))
      .rejects.toThrow('Muitas mensagens');

    content.countRecentPrivateRoomMessages.mockResolvedValue(0);
    content.hasRecentDuplicatePrivateRoomMessage.mockResolvedValue(true);
    await expect(service.submitPrivateRoomMessage('123456', 'token', { body: 'Outra' }, { ip: '203.0.113.10' }))
      .rejects.toThrow('já foi enviada');
  });

  it('rejects disabled interaction and missing required participant name', async () => {
    content.findPrivateRoomByAccessToken.mockResolvedValue(privateRoom('vip1'));
    content.getPrivateRoomInteractionSettings.mockResolvedValue({ ...interactionSettings('vip1'), enabled: false });
    await expect(service.submitPrivateRoomMessage('123456', 'token', { body: 'Pergunta' }, actor))
      .rejects.toThrow('desativada');

    content.getPrivateRoomInteractionSettings.mockResolvedValue(interactionSettings('vip1'));
    await expect(service.submitPrivateRoomMessage('123456', 'token', { body: 'Pergunta' }, actor))
      .rejects.toThrow('Informe seu nome');
  });

  it('returns public interaction without leaking moderation-only fields', async () => {
    content.findPrivateRoomByAccessToken.mockResolvedValue(privateRoom('vip1'));
    content.getPrivateRoomInteractionSettings.mockResolvedValue({ ...interactionSettings('vip1'), allowPublicReplies: false });
    content.listPrivateRoomMessages.mockResolvedValue([
      {
        ...privateRoomMessage('msg1'),
        participantContact: 'cliente@example.com',
        status: 'answered',
        isHighlighted: true,
        adminReply: 'Resposta privada no admin',
      },
    ]);

    const interaction = await service.getPrivateRoomInteractionForAccess('123456', 'token');

    expect(interaction.settings).toMatchObject({ enabled: true, allowPublicReplies: false });
    expect(interaction.messages).toEqual([
      expect.objectContaining({
        id: 'msg1',
        participantName: 'Cliente',
        adminReply: '',
        isHighlighted: true,
      }),
    ]);
    expect(JSON.stringify(interaction)).not.toContain('cliente@example.com');
    expect(interaction.highlightedMessage).toMatchObject({ id: 'msg1' });

    content.getPrivateRoomInteractionSettings.mockResolvedValue({ ...interactionSettings('vip1'), enabled: false });
    await expect(service.getPrivateRoomInteractionForAccess('123456', 'token'))
      .resolves.toMatchObject({ messages: [], highlightedMessage: null });
  });

  it('moderates private room messages with replies and highlight validation', async () => {
    content.findPrivateRoomMessage.mockResolvedValue(privateRoomMessage('msg1'));
    content.updatePrivateRoomMessage.mockImplementation(async (id, input) => ({
      ...privateRoomMessage(id),
      status: input.status ?? 'pending',
      adminReply: input.adminReply ?? '',
      isHighlighted: Boolean(input.isHighlighted),
      moderatedBy: input.moderatedBy,
      moderatedAt: input.moderatedAt,
    }));

    const message = await service.moderatePrivateRoomMessage('msg1', {
      status: 'answered',
      adminReply: '  Respondido pelo admin  ',
      isHighlighted: true,
    }, actor);

    expect(message).toMatchObject({ status: 'answered', adminReply: 'Respondido pelo admin', isHighlighted: true });
    expect(content.updatePrivateRoomMessage).toHaveBeenCalledWith('msg1', expect.objectContaining({
      status: 'answered',
      adminReply: 'Respondido pelo admin',
      isHighlighted: true,
      moderatedBy: actor.userId,
      moderatedAt: expect.any(Date),
    }));
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'private_room_interaction.message_moderated',
      targetId: 'msg1',
      metadata: expect.objectContaining({ hasReply: true }),
    }));

    await expect(service.moderatePrivateRoomMessage('msg1', { isHighlighted: true }, actor))
      .rejects.toThrow('aprovadas ou respondidas');

    content.findPrivateRoomMessage.mockResolvedValue(undefined);
    await expect(service.moderatePrivateRoomMessage('missing', { status: 'approved' }, actor))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});
