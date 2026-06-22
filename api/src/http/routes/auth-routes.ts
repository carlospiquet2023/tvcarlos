import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config.js';
import type { AuthService } from '../../application/auth-service.js';
import { credentialsSchema, loginSchema, parseInput } from '../schemas.js';
import { CSRF_COOKIE, SESSION_COOKIE, createAuthContext, requestAuditContext } from '../auth-context.js';

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, authService: AuthService) {
  const context = createAuthContext(authService);

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes', ban: 3 } },
  }, async (request, reply) => {
    const input = parseInput(loginSchema, request.body);
    const result = await authService.login(input.username, input.password, requestAuditContext(request));
    setAuthCookies(reply, config, result.token, result.csrfToken, result.expiresAt);
    return reply.send({ user: result.user, expiresAt: result.expiresAt });
  });

  app.get('/api/auth/session', { preHandler: context.requireAuth }, async (request) => {
    const session = context.getSession(request);
    return { user: session.user, expiresAt: session.expiresAt };
  });

  app.post('/api/auth/logout', { preHandler: [context.requireAuth, context.requireCsrf] }, async (request, reply) => {
    const session = context.getSession(request);
    await authService.logout(session.tokenHash, session.user.id, requestAuditContext(request));
    clearAuthCookies(reply, config);
    return reply.code(204).send();
  });

  app.put('/api/auth/credentials', { preHandler: [context.requireAuth, context.requireCsrf] }, async (request, reply) => {
    const input = parseInput(credentialsSchema, request.body);
    const session = context.getSession(request);
    await authService.changeCredentials(
      session.user.id,
      input.currentPassword,
      input.newUsername,
      input.newPassword,
      requestAuditContext(request),
    );
    clearAuthCookies(reply, config);
    return reply.code(204).send();
  });

  return context;
}

function cookieOptions(config: AppConfig, httpOnly: boolean) {
  return {
    path: '/',
    httpOnly,
    secure: config.cookieSecure,
    sameSite: 'strict' as const,
  };
}

function setAuthCookies(reply: FastifyReply, config: AppConfig, token: string, csrf: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions(config, true), expires: expiresAt });
  reply.setCookie(CSRF_COOKIE, csrf, { ...cookieOptions(config, false), expires: expiresAt });
}

function clearAuthCookies(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(SESSION_COOKIE, cookieOptions(config, true));
  reply.clearCookie(CSRF_COOKIE, cookieOptions(config, false));
}
