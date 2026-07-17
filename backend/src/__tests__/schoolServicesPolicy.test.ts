import { describe, expect, it } from 'vitest';
import { SchoolApiError } from '../modules/school/validation';
import {
    assertTermsDoNotOverlap,
    parseAcademicTerms,
} from '../modules/school/schoolOrganizationService';
import {
    buildDataQualityReport,
    qualityCheck,
    rankStudentRiskProfiles,
} from '../modules/school/schoolInsightsService';

describe('school organization policies', () => {
    it('normalizes academic terms and assigns a stable order', () => {
        const terms = parseAcademicTerms([
            { name: 'Primeiro', startDate: '2026-02-01', endDate: '2026-05-31' },
            { name: 'Segundo', startDate: '2026-06-01', endDate: '2026-11-30' },
        ], new Date('2026-02-01T00:00:00.000Z'), new Date('2026-11-30T00:00:00.000Z'));

        expect(terms.map((term) => ({ name: term.name, order: term.order }))).toEqual([
            { name: 'Primeiro', order: 1 },
            { name: 'Segundo', order: 2 },
        ]);
    });

    it('rejects empty, overlapping and out-of-year academic terms', () => {
        const yearStart = new Date('2026-02-01T00:00:00.000Z');
        const yearEnd = new Date('2026-11-30T00:00:00.000Z');
        expect(() => parseAcademicTerms([], yearStart, yearEnd)).toThrow('Informe ao menos um período letivo.');
        expect(() => parseAcademicTerms([
            { name: 'Primeiro', startDate: '2026-02-01', endDate: '2026-06-01' },
            { name: 'Segundo', startDate: '2026-06-01', endDate: '2026-11-30' },
        ], yearStart, yearEnd)).toThrow('Períodos letivos não podem se sobrepor.');
        expect(() => parseAcademicTerms([
            { name: 'Fora', startDate: '2026-01-31', endDate: '2026-02-28' },
        ], yearStart, yearEnd)).toThrow('Período fora do ano letivo.');
    });

    it('detects overlap independently from input ordering', () => {
        expect(() => assertTermsDoNotOverlap([
            { startDate: new Date('2026-06-01'), endDate: new Date('2026-11-30') },
            { startDate: new Date('2026-02-01'), endDate: new Date('2026-06-01') },
        ])).toThrow(SchoolApiError);
    });
});
describe('school insight policies', () => {
    it('treats an empty population as complete and averages check coverage', () => {
        const empty = qualityCheck('EMPTY', 'Sem registros', 0, 0, 'medium');
        const partial = qualityCheck('PARTIAL', 'Parcial', 1, 4, 'high');
        expect(empty).toMatchObject({ coveragePercent: 100, missing: 0 });
        expect(partial).toMatchObject({ coveragePercent: 25, missing: 3 });
        expect(buildDataQualityReport(
            [empty, partial],
            new Date('2026-07-13T12:00:00.000Z'),
        )).toMatchObject({ score: 63, generatedAt: '2026-07-13T12:00:00.000Z' });
    });

    it('ranks students by explainable risk evidence', () => {
        const schoolClass = {
            id: 'class',
            name: 'Turma A',
            gradeLevel: '7º ano',
            campus: { id: 'campus', name: 'Central' },
        };
        const ranked = rankStudentRiskProfiles([
            {
                schoolClass,
                student: {
                    id: 'stable',
                    name: 'Aluno Estável',
                    classAttendance: [{ status: 'PRESENT' }, { status: 'PRESENT' }],
                    assessmentGrades: [{ score: 10, assessment: { maxScore: 10 } }],
                    studentInterventions: [],
                },
            },
            {
                schoolClass,
                student: {
                    id: 'critical',
                    name: 'Aluno em Risco',
                    classAttendance: [
                        { status: 'ABSENT' }, { status: 'ABSENT' },
                        { status: 'ABSENT' }, { status: 'ABSENT' },
                    ],
                    assessmentGrades: [
                        { score: 1, assessment: { maxScore: 10 } },
                        { score: 2, assessment: { maxScore: 10 } },
                    ],
                    studentInterventions: [{ id: 'i1' }, { id: 'i2' }],
                },
            },
        ]);

        expect(ranked.map((item) => item.student.id)).toEqual(['critical', 'stable']);
        expect(ranked[0]).toMatchObject({ band: 'CRITICAL', evidence: { openInterventions: 2 } });
        expect(ranked[1]).toMatchObject({ band: 'STABLE', score: 0 });
    });
});
