export const VALID_USER_ROLES = ['ADMIN', 'TEACHER', 'STUDENT', 'STAFF', 'GUARDIAN'] as const;
export type ValidUserRole = typeof VALID_USER_ROLES[number];

export function isValidUserRole(value: unknown): value is ValidUserRole {
    return typeof value === 'string' && VALID_USER_ROLES.includes(value as ValidUserRole);
}

export function passwordValidationMessage(password: unknown): string | null {
    if (typeof password !== 'string' || password.length < 8) {
        return 'A senha deve ter pelo menos 8 caracteres.';
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return 'A senha deve conter letras maiúsculas, minúsculas e números.';
    }
    return null;
}

export interface UserListQuery {
    page: number;
    limit: number;
    search: string;
    skip: number;
}

export function parseUserListQuery(query: Record<string, unknown>): UserListQuery {
    const parsedPage = Number.parseInt(String(query.page ?? ''), 10);
    const parsedLimit = Number.parseInt(String(query.limit ?? ''), 10);
    const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(100, Math.max(1, parsedLimit));
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    return { page, limit, search, skip: (page - 1) * limit };
}

export function isSelfTarget(actorId: string, targetId: string): boolean {
    return actorId === targetId;
}
