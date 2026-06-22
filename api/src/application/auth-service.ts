import { randomUUID } from 'node:crypto';
import type { AuditRepository, SessionRepository, UserRepository } from './ports.js';
import { UnauthorizedError, ValidationError } from './errors.js';
import type { User } from '../domain/models.js';
import { hashPassword, verifyPassword } from '../infrastructure/security/password.js';
import { hashToken, randomToken } from '../infrastructure/security/tokens.js';

export interface RequestAuditContext {
  requestId?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthenticatedSession {
  user: Pick<User, 'id' | 'username'>;
  csrfHash: string;
  expiresAt: Date;
  tokenHash: string;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditRepository,
    private readonly sessionTtlMinutes: number,
    private readonly dummyHash: string,
  ) {}

  static async create(
    users: UserRepository,
    sessions: SessionRepository,
    audit: AuditRepository,
    sessionTtlMinutes: number,
  ): Promise<AuthService> {
    return new AuthService(users, sessions, audit, sessionTtlMinutes, await hashPassword('not-a-real-password-value'));
  }

  async login(username: string, password: string, context: RequestAuditContext) {
    const normalizedUsername = normalizeUsername(username);
    const user = await this.users.findByUsername(normalizedUsername);
    const result = await verifyPassword(password, user?.passwordHash ?? this.dummyHash);

    if (!user || !result.valid) {
      await this.audit.append({
        action: 'auth.login_failed',
        targetType: 'user',
        requestId: context.requestId,
        ip: context.ip,
        metadata: { normalizedUsername, userAgent: context.userAgent },
      });
      throw new UnauthorizedError('Usuário ou senha inválidos.');
    }

    if (result.needsRehash) {
      await this.users.updatePasswordHash(user.id, await hashPassword(password));
    }

    const token = randomToken();
    const csrfToken = randomToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlMinutes * 60_000);
    await this.sessions.deleteExpired(now);
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrfToken),
      expiresAt,
      createdAt: now,
    });
    await this.audit.append({
      actorUserId: user.id,
      action: 'auth.login_succeeded',
      targetType: 'session',
      requestId: context.requestId,
      ip: context.ip,
      metadata: { userAgent: context.userAgent },
    });

    return { token, csrfToken, expiresAt, user: { id: user.id, username: user.username } };
  }

  async authenticate(rawToken: string | undefined): Promise<AuthenticatedSession> {
    if (!rawToken) throw new UnauthorizedError();
    const tokenHash = hashToken(rawToken);
    const session = await this.sessions.findValidByTokenHash(tokenHash, new Date());
    if (!session) throw new UnauthorizedError('Sessão inválida ou expirada.');
    return {
      user: { id: session.user.id, username: session.user.username },
      csrfHash: session.csrfHash,
      expiresAt: session.expiresAt,
      tokenHash,
    };
  }

  async logout(tokenHash: string, userId: string, context: RequestAuditContext): Promise<void> {
    await this.sessions.deleteByTokenHash(tokenHash);
    await this.audit.append({
      actorUserId: userId,
      action: 'auth.logout',
      targetType: 'session',
      requestId: context.requestId,
      ip: context.ip,
    });
  }

  async changeCredentials(
    userId: string,
    currentPassword: string,
    newUsername: string,
    newPassword: string,
    context: RequestAuditContext,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash)).valid) {
      throw new UnauthorizedError('Senha atual incorreta.');
    }
    validatePassword(newPassword, newUsername);
    const normalizedUsername = normalizeUsername(newUsername);
    await this.users.updateCredentialsAndRevokeSessions(
      userId,
      newUsername.trim(),
      normalizedUsername,
      await hashPassword(newPassword),
    );
    await this.audit.append({
      actorUserId: userId,
      action: 'auth.credentials_changed',
      targetType: 'user',
      targetId: userId,
      requestId: context.requestId,
      ip: context.ip,
    });
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

export function validatePassword(password: string, username: string): void {
  if (password.length < 14 || password.length > 128) {
    throw new ValidationError('A senha deve ter entre 14 e 128 caracteres.');
  }
  const normalized = password.toLocaleLowerCase('pt-BR');
  const blocked = ['admin123', 'password', 'senha123', '123456789', 'tvcarlos'];
  if (blocked.some((word) => normalized.includes(word)) || normalized.includes(normalizeUsername(username))) {
    throw new ValidationError('Escolha uma senha longa que não contenha o usuário nem termos previsíveis.');
  }
}
