import type { FastifyInstance, FastifyRequest } from 'fastify';
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
  partnerSchema,
  programSchema,
} from '../schemas.js';

type AuthContext = ReturnType<typeof createAuthContext>;

export function registerContentRoutes(app: FastifyInstance, content: ContentService, auth: AuthContext) {
  app.get('/api/news', async () => content.listNews());
  app.post('/api/news', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(newsSchema, request.body);
    const item = await content.createNews(input.text, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/news/order', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderNews(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/news/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(newsSchema, request.body);
    return content.updateNews(id, input.text, actor(request, auth));
  });
  app.delete('/api/news/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteNews(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/grade', async () => {
    const programs = await content.listPrograms();
    return programs.map((program) => ({ ...program, desc: program.description }));
  });
  app.post('/api/grade', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const raw = request.body as Record<string, unknown> | undefined;
    const input = parseInput(programSchema, raw && 'desc' in raw
      ? { title: raw.title, description: raw.desc, video: raw.video }
      : raw);
    const item = await content.createProgram(input, actor(request, auth));
    return reply.code(201).send({ ...item, desc: item.description });
  });
  app.put('/api/grade/order', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderPrograms(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/grade/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(programSchema, request.body);
    const item = await content.updateProgram(id, input, actor(request, auth));
    return { ...item, desc: item.description };
  });
  app.delete('/api/grade/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteProgram(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/branding', async () => content.getBranding());
  app.put('/api/branding', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const input = parseInput(brandingSchema, request.body);
    return content.updateBranding(input, actor(request, auth));
  });

  app.get('/api/partners', async () => content.listPartners());
  app.post('/api/partners', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(partnerSchema, request.body);
    const item = await content.createPartner(input, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/partners/order', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderPartners(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/partners/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    const input = parseInput(partnerSchema, request.body);
    return content.updatePartner(id, input, actor(request, auth));
  });
  app.delete('/api/partners/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deletePartner(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/header-links', async () => content.listHeaderLinks());
  app.post('/api/header-links', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(headerLinkSchema, request.body);
    const item = await content.createHeaderLink(input, actor(request, auth));
    return reply.code(201).send(item);
  });
  app.put('/api/header-links/order', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const input = parseInput(orderSchema, request.body);
    await content.reorderHeaderLinks(input.ids, actor(request, auth));
    return reply.code(204).send();
  });
  app.put('/api/header-links/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    return content.updateHeaderLink(id, parseInput(headerLinkSchema, request.body), actor(request, auth));
  });
  app.delete('/api/header-links/:id', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const id = parseInput(idSchema, (request.params as { id?: unknown }).id);
    await content.deleteHeaderLink(id, actor(request, auth));
    return reply.code(204).send();
  });

  app.get('/api/audit', { preHandler: auth.requireAuth }, async (request) => {
    const query = parseInput(auditQuerySchema, request.query);
    return content.listAuditLogs(query.limit);
  });
}

function actor(request: FastifyRequest, auth: AuthContext) {
  const session = auth.getSession(request);
  return { userId: session.user.id, ...requestAuditContext(request) };
}
