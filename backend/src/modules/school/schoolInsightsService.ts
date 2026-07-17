import prisma from '../../lib/prisma';
import type { JwtPayload } from '../../middleware/authMiddleware';
import { calculateStudentRisk } from './analytics';
import { SCHOOL_MANAGEMENT_ROLES, requireOrganizationAccess } from './access';
import { SchoolApiError } from './validation';

const STUDENT_RISK_ROLES = [
    'ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'COUNSELOR',
] as const;

export interface QualityCheck {
    code: string;
    label: string;
    severity: string;
    complete: number;
    total: number;
    missing: number;
    coveragePercent: number;
}

interface RiskEnrollment {
    schoolClass: {
        id: string;
        name: string;
        gradeLevel: string;
        campus: { id: string; name: string };
    };
    student: {
        id: string;
        name: string;
        classAttendance: Array<{ status: string }>;
        assessmentGrades: Array<{ score: number | null; assessment: { maxScore: number } }>;
        studentInterventions: Array<{ id: string }>;
    };
}

export async function getSchoolDataQuality(actor: JwtPayload, organizationId: string) {
    await requireOrganizationAccess(actor, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const organization = await prisma.schoolOrganization.findUnique({
        where: { id: organizationId },
        select: { inepCode: true },
    });
    if (!organization) throw new SchoolApiError(404, 'Instituição não encontrada.');

    const [campuses, classes, enrollments, offerings, subjects, studentsWithGuardian] = await Promise.all([
        prisma.schoolCampus.findMany({ where: { organizationId, active: true }, select: { id: true, inepCode: true } }),
        prisma.schoolClass.findMany({
            where: { organizationId, active: true },
            select: { id: true, educationStage: true, gradeLevel: true, _count: { select: { offerings: true } } },
        }),
        prisma.schoolEnrollment.findMany({
            where: { organizationId, status: 'ACTIVE' },
            select: { studentId: true, enrollmentCode: true },
        }),
        prisma.subjectOffering.findMany({
            where: { organizationId, active: true },
            select: { id: true, teacherId: true, weeklyMinutes: true },
        }),
        prisma.schoolSubject.findMany({
            where: { organizationId, active: true },
            select: { id: true, workloadMinutes: true },
        }),
        prisma.guardianLink.findMany({
            where: { student: { schoolEnrollments: { some: { organizationId, status: 'ACTIVE' } } } },
            distinct: ['studentId'],
            select: { studentId: true },
        }),
    ]);

    const guardianIds = new Set(studentsWithGuardian.map((item) => item.studentId));
    const checks = [
        qualityCheck('INEP_INSTITUTION', 'Código INEP da instituição', organization.inepCode ? 1 : 0, 1, 'critical'),
        qualityCheck('INEP_CAMPUSES', 'Código INEP das unidades', campuses.filter((item) => item.inepCode).length, campuses.length, 'critical'),
        qualityCheck('CLASS_STAGE', 'Etapa de ensino nas turmas', classes.filter((item) => item.educationStage && item.gradeLevel).length, classes.length, 'high'),
        qualityCheck('ENROLLMENT_CODE', 'Código de matrícula dos estudantes', enrollments.filter((item) => item.enrollmentCode).length, enrollments.length, 'critical'),
        qualityCheck('GUARDIAN_LINK', 'Vínculo de responsável', enrollments.filter((item) => guardianIds.has(item.studentId)).length, enrollments.length, 'high'),
        qualityCheck('CLASS_OFFERINGS', 'Matriz curricular nas turmas', classes.filter((item) => item._count.offerings > 0).length, classes.length, 'critical'),
        qualityCheck('OFFERING_TEACHER', 'Docente atribuído às disciplinas', offerings.filter((item) => item.teacherId).length, offerings.length, 'high'),
        qualityCheck('OFFERING_WORKLOAD', 'Carga semanal das disciplinas', offerings.filter((item) => item.weeklyMinutes > 0).length, offerings.length, 'medium'),
        qualityCheck('SUBJECT_WORKLOAD', 'Carga total do currículo', subjects.filter((item) => item.workloadMinutes > 0).length, subjects.length, 'medium'),
    ];
    return buildDataQualityReport(checks);
}

export async function getStudentRiskAnalytics(actor: JwtPayload, organizationId: string) {
    await requireOrganizationAccess(actor, organizationId, STUDENT_RISK_ROLES);
    const activeEnrollments = await prisma.schoolEnrollment.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: {
            schoolClass: {
                select: { id: true, name: true, gradeLevel: true, campus: { select: { id: true, name: true } } },
            },
            student: {
                select: {
                    id: true,
                    name: true,
                    classAttendance: {
                        where: { session: { offering: { organizationId } } },
                        select: { status: true, session: { select: { date: true } } },
                        orderBy: { session: { date: 'desc' } },
                        take: 60,
                    },
                    assessmentGrades: {
                        where: {
                            status: 'PUBLISHED',
                            score: { not: null },
                            assessment: { published: true, offering: { organizationId } },
                        },
                        select: { score: true, assessment: { select: { maxScore: true } } },
                        orderBy: { gradedAt: 'desc' },
                        take: 30,
                    },
                    studentInterventions: {
                        where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS', 'MONITORING'] } },
                        select: { id: true, riskLevel: true, status: true, title: true },
                        take: 10,
                    },
                },
            },
        },
        orderBy: { student: { name: 'asc' } },
    });

    const students = rankStudentRiskProfiles(activeEnrollments);
    await prisma.auditLog.create({
        data: {
            userId: actor.id,
            action: 'STUDENT_RISK_VIEW',
            target: organizationId,
            details: `${students.length} estudantes avaliados`,
        },
    });
    return {
        generatedAt: new Date().toISOString(),
        policy: 'Indicador explicável de apoio. Não decide aprovação, sanção, diagnóstico ou desligamento.',
        students,
    };
}

export function qualityCheck(
    code: string,
    label: string,
    complete: number,
    total: number,
    severity: string,
): QualityCheck {
    const coveragePercent = total === 0 ? 100 : Math.round(complete / total * 100);
    return {
        code,
        label,
        severity,
        complete,
        total,
        missing: Math.max(0, total - complete),
        coveragePercent,
    };
}

export function buildDataQualityReport(checks: QualityCheck[], now = new Date()) {
    const score = checks.length
        ? Math.round(checks.reduce((sum, item) => sum + item.coveragePercent, 0) / checks.length)
        : 0;
    return { score, generatedAt: now.toISOString(), checks };
}

export function rankStudentRiskProfiles(enrollments: RiskEnrollment[]) {
    return enrollments.map((enrollment) => {
        const validGrades = enrollment.student.assessmentGrades.filter(
            (item) => item.score !== null && item.assessment.maxScore > 0,
        );
        const risk = calculateStudentRisk({
            attendanceStatuses: enrollment.student.classAttendance.map((item) => item.status),
            grades: validGrades.map((item) => ({ score: item.score, maxScore: item.assessment.maxScore })),
            openInterventions: enrollment.student.studentInterventions.length,
        });
        return {
            student: { id: enrollment.student.id, name: enrollment.student.name },
            schoolClass: enrollment.schoolClass,
            ...risk,
        };
    }).sort((left, right) => right.score - left.score);
}
