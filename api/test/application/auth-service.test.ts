import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/application/auth-service.js';
import { ForbiddenError, UnauthorizedError } from '../../src/application/errors.js';
import type { AuditRepository, SessionRepository, UserRepository } from '../../src/application/ports.js';
import type { Session, TeacherAccount, User } from '../../src/domain/models.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

class MemoryUsers implements UserRepository {
  user?: User;
  teachers: TeacherAccount[] = [];
  async count() { return this.user ? 1 : 0; }
  async listTeachers() { return this.teachers; }
  async findByUsername(value: string) { return this.user?.normalizedUsername === value ? this.user : undefined; }
  async findById(value: string) {
    if (this.user?.id === value) return this.user;
    const teacher = this.teachers.find((item) => item.id === value);
    return teacher ? { ...teacher, passwordHash: 'hash' } : undefined;
  }
  async create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { role?: User['role'] }) {
    const now = new Date();
    this.user = { ...input, role: input.role ?? 'admin', createdAt: now, updatedAt: now };
    return this.user;
  }
  async createTeacher(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { roomIds: string[] }) {
    const now = new Date();
    const teacher = { id: input.id, username: input.username, normalizedUsername: input.normalizedUsername, role: 'teacher' as const, roomIds: input.roomIds, createdAt: now, updatedAt: now };
    this.teachers.push(teacher);
    return teacher;
  }
  async updatePasswordHash(id: string, passwordHash: string) {
    if (this.user?.id === id) this.user.passwordHash = passwordHash;
  }
  async updateCredentialsAndRevokeSessions(_id: string, username: string, normalized: string, hash: string) {
    if (this.user) Object.assign(this.user, { username, normalizedUsername: normalized, passwordHash: hash });
  }
  async updateTeacherRooms(userId: string, roomIds: string[]) {
    const teacher = this.teachers.find((item) => item.id === userId);
    if (!teacher) return undefined;
    teacher.roomIds = roomIds;
    teacher.updatedAt = new Date();
    return teacher;
  }
  async deleteTeacher(userId: string) {
    const before = this.teachers.length;
    this.teachers = this.teachers.filter((teacher) => teacher.id !== userId);
    return this.teachers.length < before;
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

  it('lets the admin manage teacher credentials and room permissions', async () => {
    const adminActor = { userId: users.user?.id || 'admin', role: 'admin' as const, ip: '127.0.0.1', requestId: 'req-1' };
    const created = await service.createTeacher('Professor Aula', ['room-1'], adminActor);

    expect(created.teacher).toMatchObject({ username: 'Professor Aula', role: 'teacher', roomIds: ['room-1'] });
    expect(created.password.length).toBeGreaterThanOrEqual(14);
    await expect(service.listTeachers()).resolves.toHaveLength(1);

    const updated = await service.updateTeacherRooms(created.teacher.id, ['room-2'], adminActor);
    expect(updated.roomIds).toEqual(['room-2']);

    const rotated = await service.rotateTeacherPassword(created.teacher.id, adminActor);
    expect(rotated.password).not.toBe(created.password);

    await service.deleteTeacher(created.teacher.id, adminActor);
    await expect(service.listTeachers()).resolves.toHaveLength(0);
    expect(audit.entries.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'teacher.created',
      'teacher.rooms_updated',
      'teacher.password_rotated',
      'teacher.deleted',
    ]));
  });

  it('blocks teacher users from managing other teacher accounts', async () => {
    await expect(service.createTeacher('Convidado', [], { userId: 'teacher', role: 'teacher', ip: '127.0.0.1' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
