import { describe, expect, it } from 'vitest';
import { calculateStudentRisk } from '../modules/school/analytics';

describe('school permanence analytics', () => {
    it('keeps a student stable when there is no negative evidence', () => {
        expect(calculateStudentRisk({ attendanceStatuses: [], grades: [], openInterventions: 0 })).toMatchObject({
            score: 0, band: 'STABLE', factors: []
        });
    });

    it('produces a critical and fully explainable result', () => {
        const result = calculateStudentRisk({
            attendanceStatuses: ['ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
            grades: [{ score: 0, maxScore: 10 }, { score: 0, maxScore: 10 }],
            openInterventions: 2,
        });
        expect(result.score).toBe(100);
        expect(result.band).toBe('CRITICAL');
        expect(result.factors).toHaveLength(3);
        expect(result.evidence).toEqual({ attendanceRecords: 4, absenceRate: 100, publishedGrades: 2, performanceRate: 0, openInterventions: 2 });
    });

    it('does not treat absence of grades as failure', () => {
        const result = calculateStudentRisk({ attendanceStatuses: ['PRESENT', 'PRESENT'], grades: [], openInterventions: 0 });
        expect(result.evidence.performanceRate).toBe(100);
        expect(result.score).toBe(0);
    });

    it('caps anomalous inputs to the score range', () => {
        const result = calculateStudentRisk({ attendanceStatuses: ['ABSENT'], grades: [{ score: -10, maxScore: 10 }], openInterventions: 50 });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });
});
