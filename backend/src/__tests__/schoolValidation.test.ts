import { describe, expect, it } from 'vitest';
import {
    SchoolApiError,
    arrayOf,
    assertDateRange,
    booleanValue,
    dateOnly,
    dateTime,
    decimal,
    integer,
    oneOf,
    rejectUnknownKeys,
    slug,
    text,
    uuid,
} from '../modules/school/validation';

describe('school API validation', () => {
    it('normalizes safe institution slugs', () => {
        expect(slug('Rede-Escola-2026')).toBe('rede-escola-2026');
        expect(() => slug('../outra-rede')).toThrow(SchoolApiError);
    });

    it('validates UUIDs and bounded text', () => {
        expect(uuid('123e4567-e89b-42d3-a456-426614174000', 'id')).toContain('123e4567');
        expect(() => uuid('1', 'id')).toThrow();
        expect(uuid('018f8f5e-7b64-7a1d-8e2a-1bb9f31c1214', 'id')).toContain('-7a1d-');
        expect(text('  Escola Central  ', 'name')).toBe('Escola Central');
        expect(() => text('x'.repeat(201), 'name')).toThrow();
    });

    it('parses date-only values without local timezone drift', () => {
        expect(dateOnly('2026-02-01', 'start').toISOString()).toBe('2026-02-01T00:00:00.000Z');
        expect(() => dateOnly('01/02/2026', 'start')).toThrow();
        expect(() => dateOnly('2026-02-29', 'start')).toThrow();
        expect(dateOnly('2028-02-29', 'start').toISOString()).toBe('2028-02-29T00:00:00.000Z');
        expect(() => assertDateRange(new Date('2026-12-01'), new Date('2026-02-01'))).toThrow();
    });

    it('requires unambiguous RFC 3339 instants', () => {
        expect(dateTime('2026-07-13T14:30:00-03:00', 'startsAt')?.toISOString()).toBe('2026-07-13T17:30:00.000Z');
        expect(dateTime('2026-07-13T17:30Z', 'startsAt')?.toISOString()).toBe('2026-07-13T17:30:00.000Z');
        expect(dateTime(undefined, 'startsAt')).toBeNull();
        expect(() => dateTime('2026-07-13', 'startsAt')).toThrow(SchoolApiError);
        expect(() => dateTime('2026-07-13T14:30:00', 'startsAt')).toThrow(SchoolApiError);
    });

    it('does not coerce strings or numbers into booleans', () => {
        expect(booleanValue(true)).toBe(true);
        expect(booleanValue(undefined, true)).toBe(true);
        expect(() => booleanValue('false')).toThrow(SchoolApiError);
        expect(() => booleanValue(0)).toThrow(SchoolApiError);
    });

    it('can reject mass-assignment fields deterministically', () => {
        expect(() => rejectUnknownKeys({ name: 'Escola' }, ['name'])).not.toThrow();
        expect(() => rejectUnknownKeys({ role: 'ADMIN', name: 'Escola', active: true }, ['name']))
            .toThrow('active, role');
    });

    it('enforces numeric and enum boundaries', () => {
        expect(integer(35, 'capacity', 1, 100)).toBe(35);
        expect(decimal(8.5, 'score', 0, 10)).toBe(8.5);
        expect(oneOf('MORNING', 'shift', ['MORNING', 'EVENING'] as const)).toBe('MORNING');
        expect(() => integer(0, 'capacity', 1, 100)).toThrow();
        expect(() => decimal(11, 'score', 0, 10)).toThrow();
        expect(() => oneOf('INVALID', 'shift', ['MORNING'] as const)).toThrow();
    });

    it('protects bulk endpoints from oversized payloads', () => {
        expect(arrayOf([1, 2], 'records', 2)).toHaveLength(2);
        expect(() => arrayOf([1, 2, 3], 'records', 2)).toThrow();
    });
});
