import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/infrastructure/security/password.js';

describe('password hashing', () => {
  it('uses a salted Argon2id hash and verifies only the correct password', async () => {
    const first = await hashPassword('Uma frase senha longa e exclusiva 2026!');
    const second = await hashPassword('Uma frase senha longa e exclusiva 2026!');

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    await expect(verifyPassword('Uma frase senha longa e exclusiva 2026!', first)).resolves.toEqual({ valid: true, needsRehash: false });
    await expect(verifyPassword('senha incorreta', first)).resolves.toEqual({ valid: false, needsRehash: false });
  });
});
