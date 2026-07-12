import { Request } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SchoolApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'SchoolApiError';
    }
}

export function bodyOf(req: Request): Record<string, unknown> {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new SchoolApiError(400, 'Corpo da requisição inválido.');
    }
    return req.body as Record<string, unknown>;
}

export function text(value: unknown, field: string, max = 200): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return value.trim();
}

export function optionalText(value: unknown, field: string, max = 2_000): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > max) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return value.trim() || null;
}

export function uuid(value: unknown, field: string): string {
    const parsed = text(value, field, 36);
    if (!UUID.test(parsed)) throw new SchoolApiError(400, `Campo ${field} inválido.`);
    return parsed;
}

export function dateOnly(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new SchoolApiError(400, `Campo ${field} deve usar AAAA-MM-DD.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new SchoolApiError(400, `Campo ${field} inválido.`);
    return parsed;
}

export function dateTime(value: unknown, field: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new SchoolApiError(400, `Campo ${field} inválido.`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new SchoolApiError(400, `Campo ${field} inválido.`);
    return parsed;
}

export function integer(value: unknown, field: string, min = 0, max = 1_000_000): number {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return Number(value);
}

export function decimal(value: unknown, field: string, min = 0, max = 1_000_000): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return value;
}

export function booleanValue(value: unknown, fallback = false): boolean {
    return value === undefined ? fallback : Boolean(value);
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return value as T;
}

export function arrayOf(value: unknown, field: string, max = 500): unknown[] {
    if (!Array.isArray(value) || value.length > max) throw new SchoolApiError(400, `Campo ${field} inválido.`);
    return value;
}

export function slug(value: unknown): string {
    const parsed = text(value, 'slug', 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed)) throw new SchoolApiError(400, 'Slug inválido.');
    return parsed;
}

export function assertDateRange(start: Date, end: Date, label = 'período'): void {
    if (end.getTime() < start.getTime()) throw new SchoolApiError(400, `Datas do ${label} são inconsistentes.`);
}
