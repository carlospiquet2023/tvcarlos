import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DatabaseSchema } from './schema.js';

export function createDatabase(databaseUrl: string) {
  const useTls = new URL(databaseUrl).searchParams.get('sslmode') === 'require';
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: useTls ? { rejectUnauthorized: true } : undefined,
  });

  pool.on('error', (error) => {
    process.stderr.write(`PostgreSQL pool error: ${error.message}\n`);
  });

  return new Kysely<DatabaseSchema>({ dialect: new PostgresDialect({ pool }) });
}
