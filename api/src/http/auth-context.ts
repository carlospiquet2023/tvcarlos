import type { FastifyRequest } from 'fastify';
import type { AuthService, AuthenticatedSession, RequestAuditContext } from '../application/auth-service.js';
import { ForbiddenError, UnauthorizedError } from '../application/errors.js';
import { tokenMatches } from '../infrastructure/security/tokens.js';

export const SESSION_COOKIE = 'tv_session';
export const CSRF_COOKIE = 'tv_csrf';

export function createAuthContext(authService: AuthService) {
  const authenticated = new WeakMap<FastifyRequest, AuthenticatedSession>();

  const requireAuth = async (request: FastifyRequest) => {
    const session = await authService.authenticate(request.cookies[SESSION_COOKIE]);
    authenticated.set(request, session);
  };

  const requireAdmin = async (request: FastifyRequest) => {
    const session = authenticated.get(request) ?? await authService.authenticate(request.cookies[SESSION_COOKIE]);
    authenticated.set(request, session);
    if (session.user.role !== 'admin') throw new ForbiddenError('Acesso restrito ao administrador principal.');
  };

  const requireCsrf = async (request: FastifyRequest) => {
    const session = authenticated.get(request);
    if (!session) throw new UnauthorizedError();
    const header = request.headers['x-csrf-token'];
    if (typeof header !== 'string' || !tokenMatches(header, session.csrfHash)) {
      throw new ForbiddenError('Token CSRF inválido.');
    }
  };

  const getSession = (request: FastifyRequest) => {
    const session = authenticated.get(request);
    if (!session) throw new UnauthorizedError();
    return session;
  };

  return { requireAuth, requireAdmin, requireCsrf, getSession };
}

export function requestAuditContext(request: FastifyRequest): RequestAuditContext {
  return {
    requestId: request.id,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
