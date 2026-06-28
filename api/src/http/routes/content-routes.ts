import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config.js';
import type { ContentService } from '../../application/content-service.js';
import type { createAuthContext } from '../auth-context.js';
import { requestAuditContext } from '../auth-context.js';
import {
  brandingSchema,
  auditQuerySchema,
  idSchema,
  headerLinkSchema,
  newsSchema,
  parseInput,
  orderSchema,
  gradeQuerySchema,
  partnerSchema,
  privateRoomAccessSchema,
  privateRoomInteractionSettingsSchema,
  privateRoomMessageModerationSchema,
  privateRoomMessageSubmitSchema,
  privateRoomSchema,
  privateRoomSupportMaterialSchema,
  programSchema,
} from '../schemas.js';

type AuthContext = ReturnType<typeof createAuthContext>;

const PRIVATE_ROOM_COOKIE = 'tv_private_room_session';

export function registerContentRoutes(app: FastifyInstance, config: AppConfig, content: ContentService, auth: AuthContext) {
  app.get('/api/news', async () => content.listNews());
  app.post('/api/news', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(newsSchema, request.body);
    const item = await content.createNews(input.text, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/news/order', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderNews(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/news/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(newsSchema, request.body);
    return content.updateNews(id, input.text, actor(request, auth));
  });
  app.delete('/api/news/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteNews(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/grade', async (request) => {
    const query = parseInput(gradeQuerySchema, request.query);
    
    // If no pagination/search is requested (e.g. from the admin panel which just wants everything),
    // we can either return all (if we didn't require pagination) or we return paginated.
    // To not break admin which expects an array, let's check if they sent queries or return standard format.
    // Actually, let's just always return an array of programs for backward compatibility with the admin panel,
    // OR we change the frontend. Let's return the `{ items, total }` if it's paginated, but wait, 
    // `resource-controller.js` expects an array. Let's see how `admin.html` uses `/api/grade`.
    // Let's modify the endpoint to return `{ items, total }` and we will fix `resource-controller.js`.
    
    const { items, total } = await content.listPrograms(query);
    return { 
      items: items.map((program) => ({ ...program, desc: program.description })),
      total 
    };
  });

  app.get('/api/categories', async () => {
    return content.listProgramCategories();
  });

  app.post('/api/grade', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const raw = request.body as Record<string, unknown> | undefined;
    const input = parseInput(programSchema, raw && 'desc' in raw
      ? { title: raw.title, description: raw.desc, video: raw.video, category: raw.category }
      : raw);
    const item = await content.createProgram({ ...input, category: input.category ?? null }, actor(request, auth));
    return reply.code(201).send({ ...item, desc: item.description });
  });
  app.put('/api/grade/order', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderPrograms(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/grade/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(programSchema, request.body);
    const item = await content.updateProgram(id, { ...input, category: input.category ?? null }, actor(request, auth));
    return { ...item, desc: item.description };
  });
  app.delete('/api/grade/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteProgram(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/branding', async () => content.getBranding());
  app.put('/api/branding', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const input = parseInput(brandingSchema, request.body);
    return content.updateBranding(input, actor(request, auth));
  });

  app.get('/api/private-rooms', { preHandler: auth.requireAdmin }, async () => content.listPrivateRooms());
  app.post('/api/private-rooms', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(privateRoomSchema, request.body);
    const item = await content.createPrivateRoom(input, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/private-rooms/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(privateRoomSchema, request.body);
    return content.updatePrivateRoom(id, input, actor(request, auth));
  });
  app.post('/api/private-rooms/:id/rotate-password', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    return content.rotatePrivateRoomPassword(id, actor(request, auth));
  });
  app.delete('/api/private-rooms/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deletePrivateRoom(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/private-rooms/:id/interaction', { preHandler: auth.requireAdmin }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    return content.getPrivateRoomInteractionAdmin(id);
  });
  app.put('/api/private-rooms/:id/interaction/settings', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(privateRoomInteractionSettingsSchema, request.body);
    return content.updatePrivateRoomInteractionSettings(id, input, actor(request, auth));
  });
  app.post('/api/private-rooms/:id/interaction/archive', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.archivePrivateRoomInteraction(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.patch('/api/private-room-messages/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(privateRoomMessageModerationSchema, request.body);
    return content.moderatePrivateRoomMessage(id, input, actor(request, auth));
  });

  app.get('/api/teacher/private-rooms', { preHandler: auth.requireAuth }, async (request) => {
    return content.listPrivateRoomsForOperator(actor(request, auth));
  });
  app.get('/api/teacher/private-rooms/:id/interaction', { preHandler: auth.requireAuth }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    return content.getPrivateRoomInteractionForOperator(id, actor(request, auth));
  });
  app.put('/api/teacher/private-rooms/:id/material', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(privateRoomSupportMaterialSchema, request.body);
    return content.updatePrivateRoomSupportMaterial(id, input, actor(request, auth));
  });

  app.post('/api/private-room-access', {
    config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const input = parseInput(privateRoomAccessSchema, request.body);
    const access = await content.grantPrivateRoomAccess(input.roomCode, input.password, requestAuditContext(request));
    setPrivateRoomCookie(reply, config, access.token, access.expiresAt);
    return reply.send({ room: access.room, url: `/sala-privada.html?room=${encodeURIComponent(access.room.roomCode)}` });
  });

  app.post('/api/private-room-access/logout', async (_request, reply) => {
    clearPrivateRoomCookie(reply, config);
    return reply.code(204).send();
  });

  app.get('/api/private-room-access/:roomCode', async (request) => {
    const params = request.params as { roomCode?: unknown };
    const roomCode = parseInput(privateRoomAccessSchema.shape.roomCode, params.roomCode);
    return content.getPrivateRoomForAccess(roomCode, request.cookies[PRIVATE_ROOM_COOKIE]);
  });

  app.get('/api/private-room-access/:roomCode/interaction', async (request) => {
    const params = request.params as { roomCode?: unknown };
    const roomCode = parseInput(privateRoomAccessSchema.shape.roomCode, params.roomCode);
    return content.getPrivateRoomInteractionForAccess(roomCode, request.cookies[PRIVATE_ROOM_COOKIE]);
  });

  app.post('/api/private-room-access/:roomCode/messages', {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = request.params as { roomCode?: unknown };
    const roomCode = parseInput(privateRoomAccessSchema.shape.roomCode, params.roomCode);
    const input = parseInput(privateRoomMessageSubmitSchema, request.body);
    const message = await content.submitPrivateRoomMessage(roomCode, request.cookies[PRIVATE_ROOM_COOKIE], input, requestAuditContext(request));
    return reply.code(201).send(message);
  });

  app.get('/api/partners', async () => content.listPartners());
  app.post('/api/partners', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(partnerSchema, request.body);
    const item = await content.createPartner(input, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/partners/order', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderPartners(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/partners/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(partnerSchema, request.body);
    return content.updatePartner(id, input, actor(request, auth));
  });
  app.delete('/api/partners/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deletePartner(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/header-links', async () => content.listHeaderLinks());
  app.post('/api/header-links', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(headerLinkSchema, request.body);
    const item = await content.createHeaderLink(input, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/header-links/order', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderHeaderLinks(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/header-links/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    return content.updateHeaderLink(id, parseInput(headerLinkSchema, request.body), actor(request, auth));
  });
  app.delete('/api/header-links/:id', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteHeaderLink(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/audit', { preHandler: auth.requireAdmin }, async (request) => {
    const query = parseInput(auditQuerySchema, request.query);
    return content.listAuditLogs(query.limit);
  });
}

function actor(request: FastifyRequest, auth: AuthContext) {
  const session = auth.getSession(request);
  return { userId: session.user.id, role: session.user.role, ...requestAuditContext(request) };
}

function setPrivateRoomCookie(reply: FastifyReply, config: AppConfig, token: string, expiresAt: Date) {
  reply.setCookie(PRIVATE_ROOM_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    expires: expiresAt,
  });
}

function clearPrivateRoomCookie(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(PRIVATE_ROOM_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
  });
}
