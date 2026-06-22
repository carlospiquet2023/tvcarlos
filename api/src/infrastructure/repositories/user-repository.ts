import type { UserRepository } from '../../application/ports.js';
import type { User } from '../../domain/models.js';
import type { Database } from '../database/schema.js';

function toUser(row: {
  id: string;
  username: string;
  normalized_username: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}): User {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly database: Database) {}

  async count(): Promise<number> {
    const result = await this.database
      .selectFrom('users')
      .select((expression) => expression.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async findByUsername(normalizedUsername: string): Promise<User | undefined> {
    const row = await this.database
      .selectFrom('users')
      .selectAll()
      .where('normalized_username', '=', normalizedUsername)
      .executeTakeFirst();
    return row ? toUser(row) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const row = await this.database.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toUser(row) : undefined;
  }

  async create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'>): Promise<User> {
    const now = new Date();
    const row = await this.database
      .insertInto('users')
      .values({
        id: input.id,
        username: input.username,
        normalized_username: input.normalizedUsername,
        password_hash: input.passwordHash,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toUser(row);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.database
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
  }

  async updateCredentialsAndRevokeSessions(
    userId: string,
    username: string,
    normalizedUsername: string,
    passwordHash: string,
  ): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      await transaction
        .updateTable('users')
        .set({
          username,
          normalized_username: normalizedUsername,
          password_hash: passwordHash,
          updated_at: new Date(),
        })
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      await transaction.deleteFrom('sessions').where('user_id', '=', userId).execute();
    });
  }
}
