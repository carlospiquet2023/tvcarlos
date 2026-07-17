import { SchoolApiError } from './validation';

export function assertOpenAcademicPeriod(status: string): void {
    if (status === 'CLOSED' || status === 'ARCHIVED') {
        throw new SchoolApiError(409, 'O período letivo está fechado. Reabertura formal é necessária para alterar registros.');
    }
}

export function assertUniqueStudents(studentIds: string[]): void {
    if (new Set(studentIds).size !== studentIds.length) {
        throw new SchoolApiError(400, 'O lote contém estudante duplicado.');
    }
}
