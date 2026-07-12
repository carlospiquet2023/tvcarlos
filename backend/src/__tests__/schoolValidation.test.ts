import { describe, expect, it } from 'vitest';
import {
    SchoolApiError,
    arrayOf,
    assertDateRange,
    dateOnly,
    decimal,
    integer,
    oneOf,
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
        expect(text('  Escola Central  ', 'name')).toBe('Escola Central');
        expect(() => text('x'.repeat(201), 'name')).toThrow();
    });

    it('parses date-only values without local timezone drift', () => {
        expect(dateOnly('2026-02-01', 'start').toISOString()).toBe('2026-02-01T00:00:00.000Z');
        expect(() => dateOnly('01/02/2026', 'start')).toThrow();
        expect(() => assertDateRange(new Date('2026-12-01'), new Date('2026-02-01'))).toThrow();
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
