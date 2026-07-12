import { describe, expect, it } from 'vitest';
import { calculateProgressUpdate } from '../services/progressPolicy';

const now = new Date('2026-07-10T12:00:10.000Z');

describe('calculateProgressUpdate', () => {
    it('credita reprodução normal entre heartbeats', () => {
        const result = calculateProgressUpdate({
            requestedPosition: 20,
            durationSeconds: 100,
            previous: {
                position: 10,
                watchedSeconds: 10,
                lastPositionAt: new Date('2026-07-10T12:00:00.000Z'),
                completed: false,
                completedAt: null
            },
            now
        });

        expect(result.position).toBe(20);
        expect(result.watchedSeconds).toBe(20);
        expect(result.completed).toBe(false);
    });

    it('não credita um seek grande como tempo assistido', () => {
        const result = calculateProgressUpdate({
            requestedPosition: 590,
            durationSeconds: 600,
            previous: {
                position: 10,
                watchedSeconds: 10,
                lastPositionAt: new Date('2026-07-10T12:00:09.000Z'),
                completed: false,
                completedAt: null
            },
            now
        });

        expect(result.position).toBe(590);
        expect(result.watchedSeconds).toBeLessThan(20);
        expect(result.completed).toBe(false);
    });

    it('conclui somente com posição e tempo assistido acima de 90%', () => {
        const result = calculateProgressUpdate({
            requestedPosition: 95,
            durationSeconds: 100,
            previous: {
                position: 85,
                watchedSeconds: 85,
                lastPositionAt: new Date('2026-07-10T12:00:00.000Z'),
                completed: false,
                completedAt: null
            },
            now
        });

        expect(result.watchedSeconds).toBe(95);
        expect(result.completed).toBe(true);
        expect(result.completedAt).toEqual(now);
    });

    it('preserva conclusão e data já registradas', () => {
        const completedAt = new Date('2026-07-09T12:00:00.000Z');
        const result = calculateProgressUpdate({
            requestedPosition: 5,
            durationSeconds: 100,
            previous: {
                position: 100,
                watchedSeconds: 100,
                lastPositionAt: new Date('2026-07-10T12:00:00.000Z'),
                completed: true,
                completedAt
            },
            now
        });

        expect(result.completed).toBe(true);
        expect(result.completedAt).toEqual(completedAt);
        expect(result.watchedSeconds).toBe(100);
    });

    it('não conclui vídeo sem duração verificada no servidor', () => {
        const result = calculateProgressUpdate({
            requestedPosition: 9_999,
            durationSeconds: null,
            previous: null,
            now
        });

        expect(result.watchedSeconds).toBe(15);
        expect(result.completed).toBe(false);
    });
});
