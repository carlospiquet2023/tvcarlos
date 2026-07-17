export interface Credentials {
  login: string;
  password: string;
}

export function envFlag(name: string): boolean {
  return /^(?:1|true|yes)$/i.test(process.env[name]?.trim() || '');
}

export function credentialPair(prefix: 'ADMIN' | 'STUDENT'): Credentials | undefined {
  const login = process.env[`E2E_${prefix}_LOGIN`]?.trim();
  const password = process.env[`E2E_${prefix}_PASSWORD`];

  if (!login && !password) return undefined;
  if (!login || !password) {
    throw new Error(`E2E_${prefix}_LOGIN e E2E_${prefix}_PASSWORD devem ser informadas juntas.`);
  }
  return { login, password };
}

export function apiUrl(pathname: string): string {
  const rawBase = process.env.E2E_API_URL;
  if (!rawBase) throw new Error('E2E_API_URL não foi inicializada pelo Playwright.');
  return new URL(pathname, `${rawBase}/`).toString();
}
