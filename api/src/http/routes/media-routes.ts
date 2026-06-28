import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MediaService } from '../../application/media-service.js';
import { ValidationError } from '../../application/errors.js';
import type { createAuthContext } from '../auth-context.js';
import { requestAuditContext } from '../auth-context.js';
import type { MediaKind } from '../../domain/models.js';

type AuthContext = ReturnType<typeof createAuthContext>;

export function registerMediaRoutes(app: FastifyInstance, media: MediaService, auth: AuthContext) {
  app.post('/api/upload/image', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const result = await receiveAndStore(request, 'image', 10 * 1024 * 1024, media, auth);
    return reply.code(201).send(result);
  });

  app.post('/api/upload/video', { preHandler: [auth.requireAdmin, auth.requireCsrf] }, async (request, reply) => {
    const result = await receiveAndStore(request, 'video', 500 * 1024 * 1024, media, auth);
    return reply.code(201).send({ ...result, filename: result.url });
  });

  app.post('/api/upload/document', { preHandler: [auth.requireAuth, auth.requireCsrf] }, async (request, reply) => {
    const result = await receiveAndStore(request, 'document', 25 * 1024 * 1024, media, auth);
    return reply.code(201).send(result);
  });
}

async function receiveAndStore(
  request: FastifyRequest,
  kind: MediaKind,
  limit: number,
  media: MediaService,
  auth: AuthContext,
) {
  const part = await request.file({ limits: { files: 1, fileSize: limit, fields: 0, parts: 1 } });
  if (!part) throw new ValidationError('Envie exatamente um arquivo no campo "file".');

  const uploadDirectory = await mkdtemp(path.join(tmpdir(), 'tvcarlos-upload-'));
  const uploadPath = path.join(uploadDirectory, randomUUID());
  try {
    await pipeline(part.file, createWriteStream(uploadPath, { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated) throw new ValidationError(`Arquivo excede o limite de ${Math.floor(limit / 1024 / 1024)} MB.`);
    const session = auth.getSession(request);
    return await media.store(kind, uploadPath, part.filename, {
      userId: session.user.id,
      ...requestAuditContext(request),
    });
  } finally {
    await rm(uploadDirectory, { recursive: true, force: true });
  }
}
