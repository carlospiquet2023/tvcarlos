import type { UserRepository } from '../../application/ports.js';
import type { TeacherAccount, User } from '../../domain/models.js';
import type { Database } from '../database/schema.js';

function toUser(row: {
  id: string;
  username: string;
  normalized_username: string;
  password_hash: string;
  role: User['role'];
  created_at: Date;
  updated_at: Date;
}): User {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    passwordHash: row.password_hash,
    role: row.role,
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

  async listTeachers(): Promise<TeacherAccount[]> {
    const rows = await this.database
      .selectFrom('users')
      .selectAll()
      .where('role', '=', 'teacher')
      .orderBy('created_at', 'desc')
      .execute();
    if (!rows.length) return [];

    const grants = await this.database
      .selectFrom('teacher_private_room_access')
      .select(['user_id', 'room_id'])
      .where('user_id', 'in', rows.map((row) => row.id))
      .execute();
    const roomIdsByUser = new Map<string, string[]>();
    grants.forEach((grant) => {
      roomIdsByUser.set(grant.user_id, [...(roomIdsByUser.get(grant.user_id) ?? []), grant.room_id]);
    });

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      normalizedUsername: row.normalized_username,
      role: 'teacher',
      roomIds: roomIdsByUser.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
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

  async create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { role?: User['role'] | undefined }): Promise<User> {
    const now = new Date();
    const row = await this.database
      .insertInto('users')
      .values({
        id: input.id,
        username: input.username,
        normalized_username: input.normalizedUsername,
        password_hash: input.passwordHash,
        role: input.role ?? 'admin',
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toUser(row);
  }

  async createTeacher(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { roomIds: string[] }): Promise<TeacherAccount> {
    const now = new Date();
    return this.database.transaction().execute(async (transaction) => {
      const row = await transaction
        .insertInto('users')
        .values({
          id: input.id,
          username: input.username,
          normalized_username: input.normalizedUsername,
          password_hash: input.passwordHash,
          role: 'teacher',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (input.roomIds.length) {
        await transaction
          .insertInto('teacher_private_room_access')
          .values(input.roomIds.map((roomId) => ({ user_id: row.id, room_id: roomId, created_at: now })))
          .execute();
      }

      return {
        id: row.id,
        username: row.username,
        normalizedUsername: row.normalized_username,
        role: 'teacher',
        roomIds: input.roomIds,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
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

  async updateTeacherRooms(userId: string, roomIds: string[]): Promise<TeacherAccount | undefined> {
    const user = await this.findById(userId);
    if (!user || user.role !== 'teacher') return undefined;
    const now = new Date();
    await this.database.transaction().execute(async (transaction) => {
      await transaction.deleteFrom('teacher_private_room_access').where('user_id', '=', userId).execute();
      if (roomIds.length) {
        await transaction
          .insertInto('teacher_private_room_access')
          .values(roomIds.map((roomId) => ({ user_id: userId, room_id: roomId, created_at: now })))
          .execute();
      }
      await transaction.updateTable('users').set({ updated_at: now }).where('id', '=', userId).execute();
    });
    return {
      id: user.id,
      username: user.username,
      normalizedUsername: user.normalizedUsername,
      role: 'teacher',
      roomIds,
      createdAt: user.createdAt,
      updatedAt: now,
    };
  }

  async deleteTeacher(userId: string): Promise<boolean> {
    const result = await this.database.deleteFrom('users').where('id', '=', userId).where('role', '=', 'teacher').executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
