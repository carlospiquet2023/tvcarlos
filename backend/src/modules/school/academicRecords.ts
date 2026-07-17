import type { ClassAttendanceStatus, GradeEntryStatus, Prisma } from '@prisma/client';
import type { JwtPayload } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { requireOfferingAccess } from './access';
import { assertOpenAcademicPeriod, assertUniqueStudents } from './academicPolicy';
import { SchoolApiError } from './validation';

export interface AttendanceRecordInput {
    studentId: string;
    status: ClassAttendanceStatus;
    minutesPresent: number | null;
    justification: string | null;
}

export interface AssessmentGradeInput {
    studentId: string;
    score: number | null;
    feedback: string | null;
    status: GradeEntryStatus;
}

async function audit(tx: Prisma.TransactionClient, userId: string, action: string, target: string, details: string) {
    await tx.auditLog.create({ data: { userId, action, target, details } });
}

export async function saveClassAttendance(
    actor: JwtPayload,
    sessionId: string,
    records: AttendanceRecordInput[],
): Promise<{ sessionId: string; processed: number }> {
    assertUniqueStudents(records.map((item) => item.studentId));
    const session = await prisma.classSession.findUnique({
        where: { id: sessionId },
        select: {
            offeringId: true,
            term: { select: { status: true } },
            offering: { select: { schoolClassId: true, organizationId: true } },
        },
    });
    if (!session) throw new SchoolApiError(404, 'Sessão não encontrada.');
    assertOpenAcademicPeriod(session.term.status);
    await requireOfferingAccess(actor, session.offeringId);

    const enrolled = await prisma.schoolEnrollment.findMany({
        where: {
            schoolClassId: session.offering.schoolClassId,
            studentId: { in: records.map((item) => item.studentId) },
            status: 'ACTIVE',
        },
        select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((item) => item.studentId));
    if (records.some((item) => !enrolledIds.has(item.studentId))) {
        throw new SchoolApiError(400, 'Há estudante sem matrícula ativa na turma.');
    }

    await prisma.$transaction(async (tx) => {
        for (const record of records) {
            await tx.classAttendanceRecord.upsert({
                where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
                create: { sessionId, ...record },
                update: {
                    status: record.status,
                    minutesPresent: record.minutesPresent,
                    justification: record.justification,
                },
            });
        }
        await tx.classSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } });
        await audit(tx, actor.id, 'CLASS_ATTENDANCE_BULK', sessionId, `${session.offering.organizationId}:${records.length}`);
    });
    return { sessionId, processed: records.length };
}

export async function assessmentForGradeEntry(actor: JwtPayload, assessmentId: string) {
    const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        select: {
            maxScore: true,
            offeringId: true,
            term: { select: { status: true } },
            offering: { select: { schoolClassId: true, organizationId: true } },
        },
    });
    if (!assessment) throw new SchoolApiError(404, 'Avaliação não encontrada.');
    assertOpenAcademicPeriod(assessment.term.status);
    await requireOfferingAccess(actor, assessment.offeringId);
    return assessment;
}

export async function saveAssessmentGrades(
    actor: JwtPayload,
    assessmentId: string,
    assessment: Awaited<ReturnType<typeof assessmentForGradeEntry>>,
    grades: AssessmentGradeInput[],
): Promise<{ assessmentId: string; processed: number }> {
    assertUniqueStudents(grades.map((item) => item.studentId));
    const enrolledCount = await prisma.schoolEnrollment.count({
        where: {
            schoolClassId: assessment.offering.schoolClassId,
            studentId: { in: grades.map((item) => item.studentId) },
            status: 'ACTIVE',
        },
    });
    if (enrolledCount !== grades.length) {
        throw new SchoolApiError(400, 'Há estudante sem matrícula ativa na turma.');
    }

    await prisma.$transaction(async (tx) => {
        for (const grade of grades) {
            const gradedAt = grade.status === 'PUBLISHED' ? new Date() : null;
            await tx.assessmentGrade.upsert({
                where: { assessmentId_studentId: { assessmentId, studentId: grade.studentId } },
                create: { assessmentId, ...grade, gradedAt },
                update: { score: grade.score, feedback: grade.feedback, status: grade.status, gradedAt },
            });
        }
        await audit(tx, actor.id, 'ASSESSMENT_GRADES_BULK', assessmentId, `${assessment.offering.organizationId}:${grades.length}`);
    });
    return { assessmentId, processed: grades.length };
}
