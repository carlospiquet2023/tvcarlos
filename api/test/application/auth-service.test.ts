import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/application/auth-service.js';
import { UnauthorizedError } from '../../src/application/errors.js';
import type { AuditRepository, SessionRepository, UserRepository } from '../../src/application/ports.js';
import type { Session, User } from '../../src/domain/models.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

class MemoryUsers implements UserRepository {
  user?: User;
  async count() { return this.user ? 1 : 0; }
  async findByUsername(value: string) { return this.user?.normalizedUsername === value ? this.user : undefined; }
  async findById(value: string) { return this.user?.id === value ? this.user : undefined; }
  async create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'>) {
    const now = new Date();
    this.user = { ...input, createdAt: now, updatedAt: now };
    return this.user;
  }
  async updatePasswordHash(_id: string, passwordHash: string) { if (this.user) this.user.passwordHash = passwordHash; }
  async updateCredentialsAndRevokeSessions(_id: string, username: string, normalized: string, hash: string) {
    if (this.user) Object.assign(this.user, { username, normalizedUsername: normalized, passwordHash: hash });
  }
}

class MemorySessions implements SessionRepository {
  values: Session[] = [];
  constructor(private readonly users: MemoryUsers) {}
  async create(session: Session) { this.values.push(session); }
  async findValidByTokenHash(hash: string, now: Date) {
    const session = this.values.find((item) => item.tokenHash === hash && item.expiresAt > now);
    return session && this.users.user ? { ...session, user: this.users.user } : undefined;
  }
  async deleteByTokenHash(hash: string) { this.values = this.values.filter((item) => item.tokenHash !== hash); }
  async deleteExpired(now: Date) { this.values = this.values.filter((item) => item.expiresAt > now); }
}

class MemoryAudit implements AuditRepository {
  entries: Array<Parameters<AuditRepository['append']>[0]> = [];
  async append(input: Parameters<AuditRepository['append']>[0]) { this.entries.push(input); }
}

describe('AuthService', () => {
  let users: MemoryUsers;
  let sessions: MemorySessions;
  let audit: MemoryAudit;
  let service: AuthService;

  beforeEach(async () => {
    users = new MemoryUsers();
    sessions = new MemorySessions(users);
    audit = new MemoryAudit();
    await users.create({
      id: randomUUID(), username: 'Operador', normalizedUsername: 'operador',
      passwordHash: await hashPassword('Montanha Verde 2026! Segura'),
    });
    service = await AuthService.create(users, sessions, audit, 120);
  });

  it('creates a persistent opaque session for valid credentials', async () => {
    const login = await service.login(' OPERADOR ', 'Montanha Verde 2026! Segura', { ip: '127.0.0.1' });
    expect(login.token).toHaveLength(43);
    expect(sessions.values[0]?.tokenHash).not.toBe(login.token);
    await expect(service.authenticate(login.token)).resolves.toMatchObject({ user: { username: 'Operador' } });
    expect(audit.entries.at(-1)?.action).toBe('auth.login_succeeded');
  });

  it('returns the same public error for invalid credentials and audits the attempt', async () => {
    await expect(service.login('inexistente', 'qualquer senha', {})).rejects.toBeInstanceOf(UnauthorizedError);
    expect(audit.entries.at(-1)?.action).toBe('auth.login_failed');
  });

  it('rejects an unknown session token', async () => {
    await expect(service.authenticate('invalid-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
