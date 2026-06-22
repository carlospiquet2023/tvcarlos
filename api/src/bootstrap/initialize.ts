import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { ContentRepository, UserRepository } from '../application/ports.js';
import { DEFAULT_BRANDING } from '../domain/models.js';
import { hashPassword } from '../infrastructure/security/password.js';
import { normalizeUsername, validatePassword } from '../application/auth-service.js';

export async function initializeDatabase(
  config: AppConfig,
  users: UserRepository,
  content: ContentRepository,
): Promise<void> {
  if ((await users.count()) === 0) {
    if (!config.initialAdminPassword) {
      throw new Error('Instalação nova: defina ADMIN_INITIAL_PASSWORD com pelo menos 14 caracteres.');
    }
    validatePassword(config.initialAdminPassword, config.initialAdminUsername);
    await users.create({
      id: randomUUID(),
      username: config.initialAdminUsername,
      normalizedUsername: normalizeUsername(config.initialAdminUsername),
      passwordHash: await hashPassword(config.initialAdminPassword),
    });
  }

  if (!(await content.hasContent())) {
    await content.updateBranding(DEFAULT_BRANDING);
  }
}
