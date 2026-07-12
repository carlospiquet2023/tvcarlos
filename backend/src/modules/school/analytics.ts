export interface StudentRiskInput {
    attendanceStatuses: string[];
    grades: Array<{ score: number | null; maxScore: number }>;
    openInterventions: number;
}

export function calculateStudentRisk(input: StudentRiskInput) {
    const absences = input.attendanceStatuses.filter((status) => status === 'ABSENT').length;
    const absenceRate = input.attendanceStatuses.length ? absences / input.attendanceStatuses.length : 0;
    const validGrades = input.grades.filter((item) => item.score !== null && item.maxScore > 0);
    const performanceRate = validGrades.length
        ? validGrades.reduce((sum, item) => sum + (item.score || 0) / item.maxScore, 0) / validGrades.length
        : 1;
    const score = Math.min(100, Math.max(0, Math.round(
        absenceRate * 50 + (1 - performanceRate) * 40 + Math.min(1, input.openInterventions / 2) * 10
    )));
    const factors: string[] = [];
    if (input.attendanceStatuses.length >= 3 && absenceRate >= 0.2) {
        factors.push(`${Math.round(absenceRate * 100)}% de faltas nos últimos ${input.attendanceStatuses.length} registros`);
    }
    if (validGrades.length >= 2 && performanceRate < 0.6) {
        factors.push(`${Math.round(performanceRate * 100)}% de aproveitamento médio nas avaliações publicadas`);
    }
    if (input.openInterventions) factors.push(`${input.openInterventions} intervenção(ões) em acompanhamento`);
    const band = score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 25 ? 'WATCH' : 'STABLE';
    const recommendedAction = band === 'CRITICAL' ? 'Acionar equipe de permanência e contato responsável em até 24 horas.'
        : band === 'HIGH' ? 'Revisar evidências e definir intervenção nesta semana.'
            : band === 'WATCH' ? 'Monitorar no próximo ciclo pedagógico.' : 'Manter acompanhamento regular.';

    return {
        score, band, factors, recommendedAction,
        evidence: {
            attendanceRecords: input.attendanceStatuses.length,
            absenceRate: Math.round(absenceRate * 100),
            publishedGrades: validGrades.length,
            performanceRate: Math.round(performanceRate * 100),
            openInterventions: input.openInterventions,
        }
    };
}
