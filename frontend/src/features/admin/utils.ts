import type { CourseData, CourseReport, EditUserForm, UserData } from './types';

const ROLE_LABELS: Readonly<Record<string, string>> = {
    ADMIN: 'Administrador',
    TEACHER: 'Professor',
    STUDENT: 'Aluno',
    STAFF: 'Equipe escolar',
    GUARDIAN: 'Responsável'
};

export function roleLabel(role: string): string {
    return ROLE_LABELS[role] || role;
}

export function auditActionLabel(action: string): string {
    return action
        .replace(/_/g, ' ')
        .toLocaleLowerCase('pt-BR')
        .replace(/^./, value => value.toUpperCase());
}

export function buildUserUpdatePayload(current: UserData, edited: EditUserForm): Record<string, string> {
    const payload: Record<string, string> = {};
    if (edited.name !== current.name) payload.name = edited.name;
    if (edited.email !== current.email) payload.email = edited.email;
    if (edited.role !== current.role) payload.role = edited.role;
    return payload;
}

export function buildOverviewCourseRows(courses: CourseData[], reports: CourseReport[]): CourseReport[] {
    if (reports.length > 0) return reports.slice(0, 5);
    return courses.slice(0, 5).map(course => ({
        id: course.id,
        name: course.name,
        totalStudents: course.enrollments.filter(enrollment => enrollment.enrollmentRole === 'STUDENT').length,
        totalVideos: course.modules.reduce((total, module) => total + module.videos.length, 0),
        completionRate: 0,
        completedLessons: 0,
        totalPossibleLessons: 0
    }));
}

export function formatAdminDate(date: Date): string {
    const value = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(date);
    return value.charAt(0).toUpperCase() + value.slice(1);
}
