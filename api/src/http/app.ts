import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from '../config.js';
import type { AuthService } from '../application/auth-service.js';
import type { ContentService } from '../application/content-service.js';
import type { MediaService } from '../application/media-service.js';
import { AppError, ForbiddenError } from '../application/errors.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerMediaRoutes } from './routes/media-routes.js';
import { registerStreamRoutes } from './routes/stream-routes.js';

export interface AppDependencies {
  config: AppConfig;
  authService: AuthService;
  contentService: ContentService;
  mediaService: MediaService;
  readiness: () => Promise<void>;
}

export async function buildApp(dependencies: AppDependencies) {
  const { config } = dependencies;
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id',
    logger: {
      level: config.logLevel,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword'],
        censor: '[REDACTED]',
      },
    },
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente mais tarde.' } }),
  });
  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: 500 * 1024 * 1024 },
  });

  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin.replace(/\/$/, '') !== config.appOrigin) {
      throw new ForbiddenError('Origem da requisição não autorizada.');
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.get('/api/health/live', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/api/health/ready', { config: { rateLimit: false } }, async () => {
    await dependencies.readiness();
    return { status: 'ready' };
  });

  registerStreamRoutes(app, config);

  const authContext = registerAuthRoutes(app, config, dependencies.authService);
  registerContentRoutes(app, dependencies.contentService, authContext);
  registerMediaRoutes(app, dependencies.mediaService, authContext);

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    const rateLimitPayload = typeof error === 'object' && error !== null && 'error' in error
      ? (error as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
    if (rateLimitPayload?.code === 'RATE_LIMITED') {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: typeof rateLimitPayload.message === 'string'
            ? rateLimitPayload.message
            : 'Muitas requisições. Tente novamente mais tarde.',
        },
      });
    }
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (errorCode === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'Arquivo excede o limite permitido.' } });
    }
    if (errorCode === '23505') {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Já existe um registro com esses dados.' } });
    }
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Use o ID da requisição ao contatar o suporte.' } });
  });

  return app;
}
