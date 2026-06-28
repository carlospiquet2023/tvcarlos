import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from '../../src/application/content-service.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../src/application/errors.js';
import type { AuditRepository, ContentRepository } from '../../src/application/ports.js';
import { DEFAULT_BRANDING, type HeaderLink, type NewsItem, type Partner, type PrivateRoom, type Program } from '../../src/domain/models.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

const now = new Date('2026-01-01T00:00:00Z');
const actor = { userId: 'user-1', requestId: 'request-1', ip: '127.0.0.1' };
const news = (id: string): NewsItem => ({ id, text: `Notícia ${id}`, position: 0, createdAt: now });
const program = (id: string): Program => ({ id, title: `Programa ${id}`, description: 'Descrição', video: 'video.mp4', position: 0, createdAt: now });
const partner = (id: string): Partner => ({ id, name: `Parceiro ${id}`, logoUrl: 'https://example.com/logo.png', destinationUrl: '', position: 0, createdAt: now });
const link = (id: string): HeaderLink => ({ id, name: `Link ${id}`, url: 'https://example.com', position: 0, createdAt: now });
const privateRoom = (id: string): PrivateRoom => ({
  id,
  roomCode: '123456',
  title: `Sala ${id}`,
  description: 'Conteúdo restrito',
  sourceType: 'youtube',
  sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
  isActive: true,
  expiresAt: null,
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
    listPrograms: vi.fn(async () => [program('p1'), program('p2')]),
    createProgram: vi.fn(async (input: Pick<Program, 'title' | 'description' | 'video'>) => ({ ...program('p3'), ...input })),
    updateProgram: vi.fn(async (id: string, input: Pick<Program, 'title' | 'description' | 'video'>) => ({ ...program(id), ...input })),
    reorderPrograms: vi.fn(async () => undefined),
    deleteProgram: vi.fn(async () => true),
    listPrivateRooms: vi.fn(async () => [privateRoom('vip1')]),
    findPrivateRoomByCode: vi.fn(async () => undefined),
    createPrivateRoom: vi.fn(async (input) => ({ ...privateRoom('vip3'), ...input })),
    updatePrivateRoom: vi.fn(async (id: string, input) => ({ ...privateRoom(id), ...input })),
    updatePrivateRoomPassword: vi.fn(async (id: string) => privateRoom(id)),
    deletePrivateRoom: vi.fn(async () => true),
    createPrivateRoomAccessSession: vi.fn(async () => undefined),
    findPrivateRoomByAccessToken: vi.fn(async () => privateRoom('vip1')),
    deleteExpiredPrivateRoomAccessSessions: vi.fn(async () => undefined),
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
    await expect(service.listPrograms()).resolves.toHaveLength(2);
    await expect(service.listPartners()).resolves.toHaveLength(2);
    await expect(service.listHeaderLinks()).resolves.toHaveLength(2);
    await expect(service.listPrivateRooms()).resolves.toHaveLength(1);
    await expect(service.getBranding()).resolves.toMatchObject({ companyName: 'TV Carlos' });
    await expect(service.listAuditLogs(30)).resolves.toEqual([]);
    expect(audit.list).toHaveBeenCalledWith(30);
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

    const roomInput = { title: 'Sala VIP', description: 'Cliente A', sourceType: 'youtube' as const, sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', isActive: true, expiresAt: null };
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
    await expect(service.updatePrivateRoom('x', { title: 'x', description: '', sourceType: 'live', sourceUrl: '', isActive: true, expiresAt: null }, actor)).rejects.toBeInstanceOf(NotFoundError);
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
});
