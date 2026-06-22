import { randomUUID } from 'node:crypto';
import type { AuditRepository } from '../../application/ports.js';
import type { Database } from '../database/schema.js';

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly database: Database) {}

  async list(limit: number) {
    const rows = await this.database
      .selectFrom('audit_logs')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
      action: row.action,
      targetType: row.target_type,
      ...(row.target_id ? { targetId: row.target_id } : {}),
      ...(row.request_id ? { requestId: row.request_id } : {}),
      ...(row.ip ? { ip: row.ip } : {}),
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }

  async append(input: Parameters<AuditRepository['append']>[0]): Promise<void> {
    await this.database
      .insertInto('audit_logs')
      .values({
        id: randomUUID(),
        actor_user_id: input.actorUserId ?? null,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        request_id: input.requestId ?? null,
        ip: input.ip ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        created_at: new Date(),
      })
      .execute();
  }
}
