import { sql } from 'kysely';
import { loadConfig } from './config.js';
import { createDatabase } from './infrastructure/database/client.js';
import { migrate } from './infrastructure/database/migrate.js';
import { PostgresUserRepository } from './infrastructure/repositories/user-repository.js';
import { PostgresSessionRepository } from './infrastructure/repositories/session-repository.js';
import { PostgresContentRepository } from './infrastructure/repositories/content-repository.js';
import { PostgresAuditRepository } from './infrastructure/repositories/audit-repository.js';
import { LocalMediaStorage } from './infrastructure/storage/local-storage.js';
import { R2MediaStorage } from './infrastructure/storage/r2-storage.js';
import type { MediaStorage } from './application/ports.js';
import { initializeDatabase } from './bootstrap/initialize.js';
import { AuthService } from './application/auth-service.js';
import { ContentService } from './application/content-service.js';
import { MediaService } from './application/media-service.js';
import { buildApp } from './http/app.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
await migrate(database);

const users = new PostgresUserRepository(database);
const sessions = new PostgresSessionRepository(database);
const content = new PostgresContentRepository(database);
const audit = new PostgresAuditRepository(database);
await initializeDatabase(config, users, content);

let storage: MediaStorage;
console.log('--- R2 CONFIG CHECK ---', {
  r2AccountId: !!config.r2AccountId,
  r2AccessKeyId: !!config.r2AccessKeyId,
  r2SecretAccessKey: !!config.r2SecretAccessKey,
  r2Bucket: !!config.r2Bucket,
  r2PublicUrl: !!config.r2PublicUrl
});

if (config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket && config.r2PublicUrl) {
  storage = new R2MediaStorage(config.r2AccountId, config.r2AccessKeyId, config.r2SecretAccessKey, config.r2Bucket, config.r2PublicUrl);
} else {
  storage = new LocalMediaStorage(config.imageStorageDir, config.videoStorageDir, config.documentStorageDir);
}
await storage.initialize();

const authService = await AuthService.create(users, sessions, audit, config.sessionTtlMinutes);
const contentService = new ContentService(content, audit);
const mediaService = new MediaService(storage, content, audit);

const app = await buildApp({
  config,
  authService,
  contentService,
  mediaService,
  readiness: async () => { await sql`select 1`.execute(database); },
  storageHealth: () => storage.healthCheck(),
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Graceful shutdown started');
  await app.close();
  await database.destroy();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '::', port: config.port });
