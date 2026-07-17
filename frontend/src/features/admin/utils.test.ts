import { describe, expect, it } from 'vitest';
import type { CourseData, CourseReport } from './types';
import { auditActionLabel, buildOverviewCourseRows, buildUserUpdatePayload, roleLabel } from './utils';

const course = (id: string, studentCount: number, teacherCount: number, videoCount: number): CourseData => ({
    id,
    name: `Curso ${id}`,
    description: '',
    thumbnailUrl: null,
    calendarUrl: null,
    modules: [{
        id: `module-${id}`,
        name: 'Módulo',
        pdfUrl: null,
        videos: Array.from({ length: videoCount }, (_, index) => ({
            id: `video-${id}-${index}`,
            title: `Vídeo ${index}`,
            description: null,
            content: null,
            status: 'READY',
            order: index
        }))
    }],
    enrollments: [
        ...Array.from({ length: studentCount }, (_, index) => ({
            id: `student-${id}-${index}`,
            enrollmentRole: 'STUDENT' as const,
            user: { id: `user-${id}-${index}`, name: 'Aluno', email: `student-${id}-${index}@example.com` }
        })),
        ...Array.from({ length: teacherCount }, (_, index) => ({
            id: `teacher-${id}-${index}`,
            enrollmentRole: 'TEACHER' as const,
            user: { id: `teacher-user-${id}-${index}`, name: 'Professor', email: `teacher-${id}-${index}@example.com` }
        }))
    ]
});

describe('admin presentation contracts', () => {
    it('translates known roles and preserves unknown roles', () => {
        expect(roleLabel('TEACHER')).toBe('Professor');
        expect(roleLabel('CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
    });

    it('formats audit action identifiers for people', () => {
        expect(auditActionLabel('USER_ACCESS_BLOCKED')).toBe('User access blocked');
    });

    it('sends only changed user fields to the update endpoint', () => {
        const current = {
            id: 'user-1',
            name: 'Nome Atual',
            email: 'atual@example.com',
            role: 'STUDENT',
            accessBlocked: false,
            createdAt: '2026-01-01T00:00:00.000Z'
        };

        expect(buildUserUpdatePayload(current, { name: 'Nome Novo', email: current.email, role: 'TEACHER' }))
            .toEqual({ name: 'Nome Novo', role: 'TEACHER' });
        expect(buildUserUpdatePayload(current, { name: current.name, email: current.email, role: current.role }))
            .toEqual({});
    });

    it('builds overview counters from courses when reports are absent', () => {
        const rows = buildOverviewCourseRows([course('A', 3, 1, 4)], []);

        expect(rows).toEqual([expect.objectContaining({
            id: 'A',
            totalStudents: 3,
            totalVideos: 4,
            completionRate: 0
        })]);
    });

    it('prefers the first five server reports when they exist', () => {
        const reports: CourseReport[] = Array.from({ length: 6 }, (_, index) => ({
            id: `${index}`,
            name: `Relatório ${index}`,
            totalStudents: index,
            totalVideos: index,
            completionRate: index,
            completedLessons: index,
            totalPossibleLessons: index
        }));

        expect(buildOverviewCourseRows([course('fallback', 9, 0, 9)], reports)).toEqual(reports.slice(0, 5));
    });
});
