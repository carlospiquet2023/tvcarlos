import { Algorithm, hash, verify } from '@node-rs/argon2';

const ARGON_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  try {
    return { valid: await verify(encodedHash, password), needsRehash: false };
  } catch {
    return { valid: false, needsRehash: false };
  }
}
