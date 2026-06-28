import type { SessionRepository } from '../../application/ports.js';
import type { Session, User } from '../../domain/models.js';
import type { Database } from '../database/schema.js';

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: Database) {}

  async create(session: Session): Promise<void> {
    await this.database
      .insertInto('sessions')
      .values({
        id: session.id,
        user_id: session.userId,
        token_hash: session.tokenHash,
        csrf_hash: session.csrfHash,
        expires_at: session.expiresAt,
        created_at: session.createdAt,
      })
      .executeTakeFirstOrThrow();
  }

  async findValidByTokenHash(tokenHash: string, now: Date): Promise<(Session & { user: User }) | undefined> {
    const row = await this.database
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .select([
        'sessions.id as session_id',
        'sessions.user_id',
        'sessions.token_hash',
        'sessions.csrf_hash',
        'sessions.expires_at',
        'sessions.created_at as session_created_at',
        'users.id as user_id_value',
        'users.username',
        'users.normalized_username',
        'users.password_hash',
        'users.role',
        'users.created_at as user_created_at',
        'users.updated_at',
      ])
      .where('sessions.token_hash', '=', tokenHash)
      .where('sessions.expires_at', '>', now)
      .executeTakeFirst();

    if (!row) return undefined;
    return {
      id: row.session_id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      csrfHash: row.csrf_hash,
      expiresAt: row.expires_at,
      createdAt: row.session_created_at,
      user: {
        id: row.user_id_value,
        username: row.username,
        normalizedUsername: row.normalized_username,
        passwordHash: row.password_hash,
        role: row.role,
        createdAt: row.user_created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.database.deleteFrom('sessions').where('token_hash', '=', tokenHash).execute();
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.database.deleteFrom('sessions').where('expires_at', '<=', now).execute();
  }
}
