import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from '../config.js';
import type { AuthService } from '../application/auth-service.js';
import type { ContentService } from '../application/content-service.js';
import type { MediaService } from '../application/media-service.js';
import type { ServiceHealthStatus, StorageHealth } from '../application/ports.js';
import { AppError, ForbiddenError } from '../application/errors.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerMediaRoutes } from './routes/media-routes.js';
import { registerStreamRoutes } from './routes/stream-routes.js';
import { requestAuditContext } from './auth-context.js';

export interface AppDependencies {
  config: AppConfig;
  authService: AuthService;
  contentService: ContentService;
  mediaService: MediaService;
  readiness: () => Promise<void>;
  storageHealth: () => Promise<StorageHealth>;
}

type OperationalService = {
  id: string;
  label: string;
  status: ServiceHealthStatus;
  detail: string;
  checkedAt: Date;
  metadata?: Record<string, unknown>;
};

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
  app.get('/api/stream/status', { config: { rateLimit: false } }, async () => ({ live: false, loop: false, source: 'api-fallback' }));

  registerStreamRoutes(app, config);

  const authContext = registerAuthRoutes(app, config, dependencies.authService);
  registerOperationsRoutes(app, dependencies, authContext);
  registerContentRoutes(app, config, dependencies.contentService, authContext);
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

function registerOperationsRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies,
  auth: ReturnType<typeof registerAuthRoutes>,
) {
  const previousStatus = new Map<string, ServiceHealthStatus>();

  app.get('/api/operations/status', { preHandler: auth.requireAdmin }, async (request) => {
    const services = await collectOperationalServices(dependencies);
    const session = auth.getSession(request);
    const context = { userId: session.user.id, ...requestAuditContext(request) };

    for (const service of services) {
      const previous = previousStatus.get(service.id);
      const isIssue = service.status === 'warning' || service.status === 'error';
      const recovered = previous && previous !== 'ok' && service.status === 'ok';
      if ((!previous && isIssue) || (previous && previous !== service.status && (isIssue || recovered))) {
        await dependencies.contentService.recordOperationalStatusChange(service.id, service.status, previous, service.detail, context);
      }
      previousStatus.set(service.id, service.status);
    }

    const logs = (await dependencies.contentService.listAuditLogs(50))
      .filter((entry) => entry.action.startsWith('operations.'))
      .slice(0, 12);
    const summary = services.reduce((accumulator, service) => {
      accumulator[service.status] += 1;
      return accumulator;
    }, { ok: 0, warning: 0, error: 0, neutral: 0 });
    const status = summary.error > 0 ? 'error' : summary.warning > 0 ? 'warning' : 'ok';

    return {
      checkedAt: new Date(),
      status,
      summary,
      services,
      logs,
    };
  });
}

async function collectOperationalServices(dependencies: AppDependencies): Promise<OperationalService[]> {
  const checkedAt = new Date();
  const services: OperationalService[] = [
    { id: 'api', label: 'API Fastify', status: 'ok', detail: 'Backend respondendo requisições administrativas.', checkedAt },
  ];

  services.push(await databaseStatus(dependencies, checkedAt));
  services.push(await storageStatus(dependencies, checkedAt));
  services.push(r2ConfigurationStatus(dependencies.config, checkedAt));
  services.push(environmentStatus(checkedAt));
  services.push(securityStatus(dependencies.config, checkedAt));

  return services;
}

async function databaseStatus(dependencies: AppDependencies, checkedAt: Date): Promise<OperationalService> {
  try {
    await dependencies.readiness();
    return { id: 'database', label: 'PostgreSQL', status: 'ok', detail: 'Banco respondendo consulta de prontidão.', checkedAt };
  } catch (error) {
    return {
      id: 'database',
      label: 'PostgreSQL',
      status: 'error',
      detail: error instanceof Error ? `Banco indisponível: ${error.message}` : 'Banco indisponível.',
      checkedAt,
    };
  }
}

async function storageStatus(dependencies: AppDependencies, checkedAt: Date): Promise<OperationalService> {
  try {
    const health = await dependencies.storageHealth();
    return {
      id: 'storage',
      label: health.provider === 'r2' ? 'Storage Cloudflare R2' : 'Storage local',
      status: health.status,
      detail: health.detail,
      checkedAt: health.checkedAt,
      ...(health.metadata ? { metadata: health.metadata } : {}),
    };
  } catch (error) {
    return {
      id: 'storage',
      label: 'Storage de mídia',
      status: 'error',
      detail: error instanceof Error ? `Storage indisponível: ${error.message}` : 'Storage indisponível.',
      checkedAt,
    };
  }
}

function r2ConfigurationStatus(config: AppConfig, checkedAt: Date): OperationalService {
  const configured = Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket && config.r2PublicUrl);
  if (configured) {
    return {
      id: 'cloudflare-r2',
      label: 'Cloudflare R2',
      status: 'ok',
      detail: 'Variáveis do R2 configuradas para uploads de mídia e documentos.',
      checkedAt,
      metadata: { bucket: config.r2Bucket, publicUrl: config.r2PublicUrl },
    };
  }
  return {
    id: 'cloudflare-r2',
    label: 'Cloudflare R2',
    status: config.nodeEnv === 'production' ? 'warning' : 'neutral',
    detail: config.nodeEnv === 'production'
      ? 'R2 não configurado em produção; uploads ficam dependentes do volume local.'
      : 'R2 não configurado neste ambiente; usando storage local.',
    checkedAt,
  };
}

function environmentStatus(checkedAt: Date): OperationalService {
  const railwayEnvironment = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME;
  return {
    id: 'runtime',
    label: railwayEnvironment ? 'Railway' : 'Docker/local',
    status: 'ok',
    detail: railwayEnvironment
      ? `Executando no Railway (${railwayEnvironment}).`
      : 'Executando fora do Railway, compatível com Docker/local.',
    checkedAt,
    ...(railwayEnvironment ? { metadata: { railwayEnvironment } } : {}),
  };
}

function securityStatus(config: AppConfig, checkedAt: Date): OperationalService {
  if (config.nodeEnv === 'production' && !config.cookieSecure) {
    return {
      id: 'security',
      label: 'Sessão e cookies',
      status: 'warning',
      detail: 'COOKIE_SECURE está desligado em produção. Ative HTTPS antes de liberar acesso real.',
      checkedAt,
    };
  }
  return {
    id: 'security',
    label: 'Sessão e cookies',
    status: 'ok',
    detail: 'Sessões administrativas protegidas por cookie HttpOnly, CSRF e expiração.',
    checkedAt,
  };
}
