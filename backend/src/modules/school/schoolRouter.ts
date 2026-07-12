import { NextFunction, Request, Response, Router } from 'express';
import bcrypt from 'bcrypt';
import {
    AssessmentType,
    ClassAttendanceStatus,
    GradeEntryStatus,
    InterventionRiskLevel,
    Prisma,
    SchoolEnrollmentStatus,
    SchoolRole,
    SchoolShift,
    Role,
} from '@prisma/client';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { calculateStudentRisk } from './analytics';
import { authenticateToken } from '../../middleware/authMiddleware';
import {
    SCHOOL_MANAGEMENT_ROLES,
    SCHOOL_TEACHING_ROLES,
    requireClassAccess,
    requireOfferingAccess,
    requireOrganizationAccess,
} from './access';
import {
    SchoolApiError,
    arrayOf,
    assertDateRange,
    bodyOf,
    booleanValue,
    dateOnly,
    dateTime,
    decimal,
    integer,
    oneOf,
    optionalText,
    slug,
    text,
    uuid,
} from './validation';

const router = Router();
const asyncHandler = (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };

router.use(authenticateToken);

router.get('/organizations', asyncHandler(async (req, res) => {
    const where = req.user!.role === 'ADMIN'
        ? {}
        : { memberships: { some: { userId: req.user!.id, active: true } } };
    const organizations = await prisma.schoolOrganization.findMany({
        where,
        select: {
            id: true, slug: true, name: true, status: true, timezone: true, inepCode: true,
            _count: { select: { campuses: true, classes: true, memberships: true } }
        },
        orderBy: { name: 'asc' }
    });
    res.json({ data: organizations });
}));

router.post('/organizations/setup', asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN') throw new SchoolApiError(403, 'Somente administrador global pode criar instituições.');
    const body = bodyOf(req);
    const organizationName = text(body.name, 'name', 160);
    const organizationSlug = slug(body.slug);
    const campusInput = asObject(body.campus, 'campus');
    const yearInput = asObject(body.academicYear, 'academicYear');
    const startDate = dateOnly(yearInput.startDate, 'academicYear.startDate');
    const endDate = dateOnly(yearInput.endDate, 'academicYear.endDate');
    assertDateRange(startDate, endDate, 'ano letivo');
    const terms = arrayOf(yearInput.terms, 'academicYear.terms', 12).map((raw, index) => {
        const item = asObject(raw, `terms.${index}`);
        const termStart = dateOnly(item.startDate, `terms.${index}.startDate`);
        const termEnd = dateOnly(item.endDate, `terms.${index}.endDate`);
        assertDateRange(termStart, termEnd, `período ${index + 1}`);
        if (termStart < startDate || termEnd > endDate) throw new SchoolApiError(400, 'Período fora do ano letivo.');
        return { name: text(item.name, `terms.${index}.name`, 80), order: index + 1, startDate: termStart, endDate: termEnd };
    });
    if (!terms.length) throw new SchoolApiError(400, 'Informe ao menos um período letivo.');
    assertTermsDoNotOverlap(terms);

    const organization = await prisma.$transaction(async (tx) => {
        const created = await tx.schoolOrganization.create({
            data: {
                name: organizationName,
                slug: organizationSlug,
                legalName: optionalText(body.legalName, 'legalName', 200),
                inepCode: optionalText(body.inepCode, 'inepCode', 20),
                timezone: optionalText(body.timezone, 'timezone', 80) || 'America/Sao_Paulo',
                status: 'ACTIVE',
                memberships: { create: { userId: req.user!.id, role: 'ORGANIZATION_ADMIN' } },
                campuses: {
                    create: {
                        code: text(campusInput.code, 'campus.code', 40).toUpperCase(),
                        name: text(campusInput.name, 'campus.name', 160),
                        inepCode: optionalText(campusInput.inepCode, 'campus.inepCode', 20),
                        email: optionalText(campusInput.email, 'campus.email', 200),
                        phone: optionalText(campusInput.phone, 'campus.phone', 40),
                    }
                },
                academicYears: {
                    create: {
                        name: text(yearInput.name, 'academicYear.name', 80),
                        startDate,
                        endDate,
                        status: 'ACTIVE',
                        terms: { create: terms }
                    }
                }
            },
            select: { id: true, slug: true, name: true }
        });
        await audit(tx, req.user!.id, 'SCHOOL_SETUP', created.id, created.slug);
        return created;
    });
    res.status(201).json({ data: organization });
}));

router.get('/organizations/:organizationId/bootstrap', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId);
    const organization = await prisma.schoolOrganization.findUnique({
        where: { id: organizationId },
        include: {
            campuses: { orderBy: { name: 'asc' } },
            academicYears: { include: { terms: { orderBy: { order: 'asc' } } }, orderBy: { startDate: 'desc' } },
            subjects: { where: { active: true }, orderBy: { name: 'asc' } },
            classes: {
                include: {
                    campus: { select: { id: true, name: true } },
                    academicYear: { select: { id: true, name: true, status: true } },
                    _count: { select: { enrollments: true, offerings: true } }
                },
                orderBy: [{ academicYear: { startDate: 'desc' } }, { name: 'asc' }]
            },
            memberships: {
                where: { active: true },
                include: { user: { select: { id: true, name: true, email: true, role: true } }, campus: { select: { id: true, name: true } } },
                orderBy: { user: { name: 'asc' } }
            }
        }
    });
    if (!organization) throw new SchoolApiError(404, 'Instituição não encontrada.');
    res.json({ data: organization });
}));

router.get('/organizations/:organizationId/overview', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId);
    const [campuses, classes, activeEnrollments, offerings, openInterventions, sessionsToday] = await Promise.all([
        prisma.schoolCampus.count({ where: { organizationId, active: true } }),
        prisma.schoolClass.count({ where: { organizationId, active: true } }),
        prisma.schoolEnrollment.count({ where: { organizationId, status: 'ACTIVE' } }),
        prisma.subjectOffering.count({ where: { organizationId, active: true } }),
        prisma.studentIntervention.count({ where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS', 'MONITORING'] } } }),
        prisma.classSession.count({ where: { offering: { organizationId }, date: todayUtc() } }),
    ]);
    res.json({ data: { campuses, classes, activeEnrollments, offerings, openInterventions, sessionsToday } });
}));

router.get('/organizations/:organizationId/data-quality', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const organization = await prisma.schoolOrganization.findUnique({ where: { id: organizationId }, select: { inepCode: true } });
    if (!organization) throw new SchoolApiError(404, 'Instituição não encontrada.');
    const [campuses, classes, enrollments, offerings, subjects, studentsWithGuardian] = await Promise.all([
        prisma.schoolCampus.findMany({ where: { organizationId, active: true }, select: { id: true, inepCode: true } }),
        prisma.schoolClass.findMany({ where: { organizationId, active: true }, select: { id: true, educationStage: true, gradeLevel: true, _count: { select: { offerings: true } } } }),
        prisma.schoolEnrollment.findMany({ where: { organizationId, status: 'ACTIVE' }, select: { studentId: true, enrollmentCode: true } }),
        prisma.subjectOffering.findMany({ where: { organizationId, active: true }, select: { id: true, teacherId: true, weeklyMinutes: true } }),
        prisma.schoolSubject.findMany({ where: { organizationId, active: true }, select: { id: true, workloadMinutes: true } }),
        prisma.guardianLink.findMany({
            where: { student: { schoolEnrollments: { some: { organizationId, status: 'ACTIVE' } } } },
            distinct: ['studentId'], select: { studentId: true }
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
    const score = checks.length ? Math.round(checks.reduce((sum, item) => sum + item.coveragePercent, 0) / checks.length) : 0;
    res.json({ data: { score, generatedAt: new Date().toISOString(), checks } });
}));

router.get('/organizations/:organizationId/analytics/student-risk', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, [
        'ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'COUNSELOR'
    ]);
    const activeEnrollments = await prisma.schoolEnrollment.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: {
            schoolClass: { select: { id: true, name: true, gradeLevel: true, campus: { select: { id: true, name: true } } } },
            student: {
                select: {
                    id: true, name: true,
                    classAttendance: {
                        where: { session: { offering: { organizationId } } },
                        select: { status: true, session: { select: { date: true } } },
                        orderBy: { session: { date: 'desc' } }, take: 60,
                    },
                    assessmentGrades: {
                        where: { status: 'PUBLISHED', score: { not: null }, assessment: { published: true, offering: { organizationId } } },
                        select: { score: true, assessment: { select: { maxScore: true } } },
                        orderBy: { gradedAt: 'desc' }, take: 30,
                    },
                    studentInterventions: {
                        where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS', 'MONITORING'] } },
                        select: { id: true, riskLevel: true, status: true, title: true }, take: 10,
                    }
                }
            }
        },
        orderBy: { student: { name: 'asc' } }
    });

    const students = activeEnrollments.map((enrollment) => {
        const attendance = enrollment.student.classAttendance;
        const validGrades = enrollment.student.assessmentGrades.filter((item) => item.score !== null && item.assessment.maxScore > 0);
        const interventions = enrollment.student.studentInterventions;
        const risk = calculateStudentRisk({
            attendanceStatuses: attendance.map((item) => item.status),
            grades: validGrades.map((item) => ({ score: item.score, maxScore: item.assessment.maxScore })),
            openInterventions: interventions.length,
        });
        return {
            student: { id: enrollment.student.id, name: enrollment.student.name },
            schoolClass: enrollment.schoolClass,
            ...risk,
        };
    }).sort((left, right) => right.score - left.score);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'STUDENT_RISK_VIEW', target: organizationId, details: `${students.length} estudantes avaliados` } });
    res.json({
        data: {
            generatedAt: new Date().toISOString(),
            policy: 'Indicador explicável de apoio. Não decide aprovação, sanção, diagnóstico ou desligamento.',
            students,
        }
    });
}));

router.get('/integrations/oneroster/v1p2/organizations/:organizationId/roster', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const organization = await prisma.schoolOrganization.findUnique({
        where: { id: organizationId },
        include: {
            campuses: { where: { active: true } },
            academicYears: { include: { terms: { orderBy: { order: 'asc' } } } },
            subjects: { where: { active: true } },
            memberships: { where: { active: true }, include: { user: { select: { id: true, name: true, email: true, role: true } }, campus: { select: { id: true } } } },
            classes: {
                where: { active: true },
                include: {
                    campus: { select: { id: true } },
                    academicYear: { select: { id: true } },
                    enrollments: { where: { status: 'ACTIVE' }, include: { student: { select: { id: true, name: true, email: true, username: true } } } },
                    offerings: { where: { active: true }, include: { subject: true, teacher: { select: { id: true, name: true, email: true, username: true } } } }
                }
            }
        }
    });
    if (!organization) throw new SchoolApiError(404, 'Instituição não encontrada.');

    const now = new Date().toISOString();
    const users = new Map<string, Record<string, unknown>>();
    const enrollments: Record<string, unknown>[] = [];
    const classes: Record<string, unknown>[] = [];
    for (const schoolClass of organization.classes) {
        for (const enrollment of schoolClass.enrollments) {
            users.set(enrollment.student.id, oneRosterUser(enrollment.student, 'student', schoolClass.campus.id, now));
        }
        for (const offering of schoolClass.offerings) {
            classes.push({
                sourcedId: offering.id, status: 'active', dateLastModified: now,
                title: `${schoolClass.name} — ${offering.subject.name}`,
                classCode: `${schoolClass.code}-${offering.subject.code}`,
                classType: 'scheduled', location: schoolClass.room || undefined,
                grades: [schoolClass.gradeLevel], subjects: [offering.subject.name],
                course: { sourcedId: offering.subjectId }, school: { sourcedId: schoolClass.campus.id },
                terms: [{ sourcedId: schoolClass.academicYear.id }],
            });
            for (const enrollment of schoolClass.enrollments) {
                enrollments.push(oneRosterEnrollment(`${offering.id}:${enrollment.studentId}`, offering.id, enrollment.studentId, 'student', now));
            }
            if (offering.teacher) {
                users.set(offering.teacher.id, oneRosterUser(offering.teacher, 'teacher', schoolClass.campus.id, now));
                enrollments.push(oneRosterEnrollment(`${offering.id}:${offering.teacher.id}`, offering.id, offering.teacher.id, 'teacher', now));
            }
        }
    }
    for (const membership of organization.memberships) {
        if (!users.has(membership.user.id)) {
            const role = membership.role === 'TEACHER' ? 'teacher' : 'administrator';
            users.set(membership.user.id, oneRosterUser(membership.user, role, membership.campus?.id || organization.campuses[0]?.id || organization.id, now));
        }
    }

    const payload = {
        specification: 'OneRoster 1.2 aligned provider export',
        certification: 'not-certified',
        generatedAt: now,
        orgs: [
            { sourcedId: organization.id, status: 'active', dateLastModified: now, name: organization.name, type: 'district' },
            ...organization.campuses.map((campus) => ({ sourcedId: campus.id, status: 'active', dateLastModified: now, name: campus.name, type: 'school', parent: { sourcedId: organization.id } }))
        ],
        academicSessions: organization.academicYears.flatMap((year) => [
            { sourcedId: year.id, status: 'active', dateLastModified: now, title: year.name, type: 'schoolYear', startDate: isoDateOnly(year.startDate), endDate: isoDateOnly(year.endDate), schoolYear: year.name },
            ...year.terms.map((term) => ({ sourcedId: term.id, status: 'active', dateLastModified: now, title: term.name, type: 'term', startDate: isoDateOnly(term.startDate), endDate: isoDateOnly(term.endDate), parent: { sourcedId: year.id }, schoolYear: year.name }))
        ]),
        courses: organization.subjects.map((subject) => ({ sourcedId: subject.id, status: 'active', dateLastModified: now, title: subject.name, courseCode: subject.code, subjects: [subject.name], org: { sourcedId: organization.id } })),
        classes,
        users: [...users.values()],
        enrollments,
    };
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'ONEROSTER_EXPORT', target: organizationId, details: `${classes.length} classes; ${users.size} users` } });
    res.setHeader('Content-Disposition', `attachment; filename="oneroster-${organization.slug}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(payload);
}));

router.post('/organizations/:organizationId/campuses', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const campus = await prisma.$transaction(async (tx) => {
        const created = await tx.schoolCampus.create({ data: {
            organizationId,
            code: text(body.code, 'code', 40).toUpperCase(),
            name: text(body.name, 'name', 160),
            inepCode: optionalText(body.inepCode, 'inepCode', 20),
            email: optionalText(body.email, 'email', 200),
            phone: optionalText(body.phone, 'phone', 40),
            addressJson: body.address ? JSON.stringify(asObject(body.address, 'address')) : null,
        } });
        await audit(tx, req.user!.id, 'CAMPUS_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: campus });
}));

router.post('/organizations/:organizationId/academic-years', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const startDate = dateOnly(body.startDate, 'startDate');
    const endDate = dateOnly(body.endDate, 'endDate');
    assertDateRange(startDate, endDate, 'ano letivo');
    const terms = arrayOf(body.terms, 'terms', 12).map((raw, index) => {
        const term = asObject(raw, `terms.${index}`);
        const termStart = dateOnly(term.startDate, `terms.${index}.startDate`);
        const termEnd = dateOnly(term.endDate, `terms.${index}.endDate`);
        assertDateRange(termStart, termEnd, `período ${index + 1}`);
        if (termStart < startDate || termEnd > endDate) throw new SchoolApiError(400, 'Período fora do ano letivo.');
        return { name: text(term.name, `terms.${index}.name`, 80), order: index + 1, startDate: termStart, endDate: termEnd };
    });
    if (!terms.length) throw new SchoolApiError(400, 'Informe ao menos um período letivo.');
    assertTermsDoNotOverlap(terms);
    const year = await prisma.$transaction(async (tx) => {
        if (body.status === 'ACTIVE') {
            await tx.academicYear.updateMany({ where: { organizationId, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
        }
        const created = await tx.academicYear.create({ data: {
            organizationId,
            name: text(body.name, 'name', 80), startDate, endDate,
            status: body.status === 'ACTIVE' ? 'ACTIVE' : 'PLANNING',
            terms: { create: terms }
        }, include: { terms: { orderBy: { order: 'asc' } } } });
        await audit(tx, req.user!.id, 'ACADEMIC_YEAR_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: year });
}));

router.post('/organizations/:organizationId/subjects', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const subject = await prisma.$transaction(async (tx) => {
        const created = await tx.schoolSubject.create({ data: {
            organizationId,
            code: text(body.code, 'code', 40).toUpperCase(),
            name: text(body.name, 'name', 160),
            knowledgeArea: optionalText(body.knowledgeArea, 'knowledgeArea', 120),
            bnccArea: optionalText(body.bnccArea, 'bnccArea', 120),
            workloadMinutes: body.workloadMinutes === undefined ? 0 : integer(body.workloadMinutes, 'workloadMinutes', 0, 1_000_000),
        } });
        await audit(tx, req.user!.id, 'SUBJECT_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: subject });
}));

router.post('/organizations/:organizationId/memberships', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const userId = uuid(body.userId, 'userId');
    const campusId = body.campusId ? uuid(body.campusId, 'campusId') : null;
    const role = oneOf(body.role, 'role', Object.values(SchoolRole));
    if (campusId) await assertCampusOrganization(campusId, organizationId);
    const membership = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new SchoolApiError(404, 'Usuário não encontrado.');
        const saved = await tx.schoolMembership.upsert({
            where: { organizationId_userId: { organizationId, userId } },
            create: { organizationId, userId, campusId, role },
            update: { campusId, role, active: true },
            include: { user: { select: { id: true, name: true, email: true } } }
        });
        await audit(tx, req.user!.id, 'SCHOOL_MEMBERSHIP_UPSERT', saved.id, `${organizationId}:${role}`);
        return saved;
    });
    res.status(201).json({ data: membership });
}));

router.post('/organizations/:organizationId/people', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const actorMembership = await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const role = oneOf(body.role, 'role', Object.values(Role));
    if (role === 'ADMIN') throw new SchoolApiError(400, 'Administradores globais não podem ser criados por uma instituição.');

    const name = text(body.name, 'name', 160);
    const email = emailValue(body.email);
    const password = strongPassword(body.temporaryPassword);
    const campusId = body.campusId ? uuid(body.campusId, 'campusId') : null;
    const classId = body.classId ? uuid(body.classId, 'classId') : null;
    if (campusId) await assertCampusOrganization(campusId, organizationId);
    if (classId) {
        if (role !== 'STUDENT') throw new SchoolApiError(400, 'Matrícula em turma é permitida apenas para estudantes.');
        await assertClassOrganization(classId, organizationId);
    }
    const schoolRole = role === 'TEACHER' || role === 'STAFF'
        ? oneOf(body.schoolRole || (role === 'TEACHER' ? 'TEACHER' : 'SECRETARY'), 'schoolRole', Object.values(SchoolRole))
        : null;
    if (schoolRole && ['ORGANIZATION_ADMIN', 'PRINCIPAL'].includes(schoolRole)
        && req.user!.role !== 'ADMIN'
        && !['ORGANIZATION_ADMIN', 'PRINCIPAL'].includes(actorMembership?.role || '')) {
        throw new SchoolApiError(403, 'Seu papel não permite conceder gestão superior.');
    }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new SchoolApiError(409, 'Este e-mail já está cadastrado. Vincule a conta existente em vez de duplicá-la.');
    const passwordHash = await bcrypt.hash(password, 12);

    const person = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
            data: {
                name, email, password: passwordHash, role,
                registrationCode: optionalText(body.registrationCode, 'registrationCode', 60),
                classGroup: optionalText(body.classGroup, 'classGroup', 80),
                mustChangePassword: true,
            },
            select: { id: true, name: true, email: true, role: true, registrationCode: true, mustChangePassword: true }
        });
        if (schoolRole) {
            await tx.schoolMembership.create({
                data: {
                    organizationId, userId: created.id, role: schoolRole,
                    campusId,
                }
            });
        }
        if (classId) {
            await tx.schoolEnrollment.create({
                data: {
                    organizationId, schoolClassId: classId, studentId: created.id,
                    enrollmentCode: optionalText(body.registrationCode, 'registrationCode', 60),
                }
            });
        }
        await audit(tx, req.user!.id, 'SCHOOL_PERSON_CREATE', created.id, `${organizationId}:${role}`);
        return created;
    });
    res.status(201).json({ data: person });
}));

router.post('/organizations/:organizationId/classes', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const campusId = uuid(body.campusId, 'campusId');
    const academicYearId = uuid(body.academicYearId, 'academicYearId');
    await Promise.all([assertCampusOrganization(campusId, organizationId), assertYearOrganization(academicYearId, organizationId)]);
    const schoolClass = await prisma.$transaction(async (tx) => {
        const created = await tx.schoolClass.create({ data: {
            organizationId, campusId, academicYearId,
            courseId: body.courseId ? uuid(body.courseId, 'courseId') : null,
            code: text(body.code, 'code', 40).toUpperCase(),
            name: text(body.name, 'name', 160),
            gradeLevel: text(body.gradeLevel, 'gradeLevel', 80),
            educationStage: optionalText(body.educationStage, 'educationStage', 100),
            shift: body.shift ? oneOf(body.shift, 'shift', Object.values(SchoolShift)) : 'MORNING',
            capacity: body.capacity === undefined ? null : integer(body.capacity, 'capacity', 1, 10_000),
            room: optionalText(body.room, 'room', 80),
        } });
        await audit(tx, req.user!.id, 'SCHOOL_CLASS_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: schoolClass });
}));

router.get('/organizations/:organizationId/classes/:classId/roster', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const classId = uuid(req.params.classId, 'classId');
    await requireClassAccess(req.user!, organizationId, classId);
    const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: classId, organizationId },
        include: {
            enrollments: {
                where: { status: 'ACTIVE' },
                include: { student: { select: { id: true, name: true, email: true, classGroup: true } } },
                orderBy: { student: { name: 'asc' } }
            },
            offerings: { include: { subject: true, teacher: { select: { id: true, name: true } }, timetable: true } }
        }
    });
    if (!schoolClass) throw new SchoolApiError(404, 'Turma não encontrada.');
    res.json({ data: schoolClass });
}));

router.get('/organizations/:organizationId/classes/:classId/workspace', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const classId = uuid(req.params.classId, 'classId');
    await requireClassAccess(req.user!, organizationId, classId);
    const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: classId, organizationId },
        include: {
            campus: { select: { id: true, name: true } },
            academicYear: { include: { terms: { orderBy: { order: 'asc' } } } },
            enrollments: {
                where: { status: 'ACTIVE' },
                include: { student: { select: { id: true, name: true, email: true, registrationCode: true } } },
                orderBy: { student: { name: 'asc' } }
            },
            offerings: {
                where: { active: true },
                include: {
                    subject: true,
                    teacher: { select: { id: true, name: true, email: true } },
                    timetable: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
                    sessions: {
                        include: { attendance: true, term: { select: { id: true, name: true } } },
                        orderBy: [{ date: 'desc' }, { startMinute: 'desc' }],
                        take: 40,
                    },
                    assessments: {
                        include: { grades: true, term: { select: { id: true, name: true } } },
                        orderBy: { createdAt: 'desc' },
                        take: 40,
                    }
                },
                orderBy: { subject: { name: 'asc' } }
            }
        }
    });
    if (!schoolClass) throw new SchoolApiError(404, 'Turma não encontrada.');
    res.json({ data: schoolClass });
}));

router.post('/organizations/:organizationId/classes/:classId/enrollments', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const schoolClassId = uuid(req.params.classId, 'classId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    await assertClassOrganization(schoolClassId, organizationId);
    const body = bodyOf(req);
    const studentId = uuid(body.studentId, 'studentId');
    const enrollment = await prisma.$transaction(async (tx) => {
        const student = await tx.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true } });
        if (!student) throw new SchoolApiError(404, 'Aluno não encontrado.');
        const saved = await tx.schoolEnrollment.upsert({
            where: { schoolClassId_studentId: { schoolClassId, studentId } },
            create: { organizationId, schoolClassId, studentId, enrollmentCode: optionalText(body.enrollmentCode, 'enrollmentCode', 60) },
            update: { status: 'ACTIVE', leftAt: null, enrollmentCode: optionalText(body.enrollmentCode, 'enrollmentCode', 60) },
        });
        await audit(tx, req.user!.id, 'SCHOOL_ENROLLMENT_UPSERT', saved.id, schoolClassId);
        return saved;
    });
    res.status(201).json({ data: enrollment });
}));

router.patch('/organizations/:organizationId/enrollments/:enrollmentId/status', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const enrollmentId = uuid(req.params.enrollmentId, 'enrollmentId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const status = oneOf(body.status, 'status', Object.values(SchoolEnrollmentStatus));
    const enrollment = await prisma.$transaction(async (tx) => {
        const existing = await tx.schoolEnrollment.findFirst({ where: { id: enrollmentId, organizationId } });
        if (!existing) throw new SchoolApiError(404, 'Matrícula não encontrada.');
        const updated = await tx.schoolEnrollment.update({ where: { id: enrollmentId }, data: {
            status,
            leftAt: ['TRANSFERRED', 'WITHDRAWN', 'CANCELLED'].includes(status) ? new Date() : null,
            finalOutcome: optionalText(body.finalOutcome, 'finalOutcome', 200),
        } });
        await audit(tx, req.user!.id, 'SCHOOL_ENROLLMENT_STATUS', updated.id, `${existing.status}->${status}`);
        return updated;
    });
    res.json({ data: enrollment });
}));

router.post('/organizations/:organizationId/guardian-links', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const guardianId = uuid(body.guardianId, 'guardianId');
    const studentId = uuid(body.studentId, 'studentId');
    if (guardianId === studentId) throw new SchoolApiError(400, 'Responsável e estudante devem ser pessoas diferentes.');
    const guardian = await prisma.user.findUnique({ where: { id: guardianId }, select: { id: true } });
    if (!guardian) throw new SchoolApiError(404, 'Responsável não encontrado.');
    const studentEnrollment = await prisma.schoolEnrollment.findFirst({ where: { organizationId, studentId, status: 'ACTIVE' }, select: { id: true } });
    if (!studentEnrollment) throw new SchoolApiError(400, 'O estudante não possui matrícula ativa nesta instituição.');
    const link = await prisma.$transaction(async (tx) => {
        const saved = await tx.guardianLink.upsert({
            where: { guardianId_studentId: { guardianId, studentId } },
            create: {
                guardianId, studentId, relationship: text(body.relationship, 'relationship', 80),
                primaryContact: booleanValue(body.primaryContact),
                financialResponsible: booleanValue(body.financialResponsible),
                pickupAuthorized: booleanValue(body.pickupAuthorized),
                receivesNotifications: booleanValue(body.receivesNotifications, true),
            },
            update: {
                relationship: text(body.relationship, 'relationship', 80),
                primaryContact: booleanValue(body.primaryContact),
                financialResponsible: booleanValue(body.financialResponsible),
                pickupAuthorized: booleanValue(body.pickupAuthorized),
                receivesNotifications: booleanValue(body.receivesNotifications, true),
            }
        });
        await audit(tx, req.user!.id, 'GUARDIAN_LINK_UPSERT', saved.id, organizationId);
        return saved;
    });
    res.status(201).json({ data: link });
}));

router.post('/organizations/:organizationId/classes/:classId/offerings', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    const schoolClassId = uuid(req.params.classId, 'classId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    await assertClassOrganization(schoolClassId, organizationId);
    const body = bodyOf(req);
    const subjectId = uuid(body.subjectId, 'subjectId');
    const teacherId = body.teacherId ? uuid(body.teacherId, 'teacherId') : null;
    const subject = await prisma.schoolSubject.findFirst({ where: { id: subjectId, organizationId, active: true }, select: { id: true } });
    if (!subject) throw new SchoolApiError(404, 'Disciplina não encontrada.');
    if (teacherId) {
        const teacherMembership = await prisma.schoolMembership.findFirst({ where: { organizationId, userId: teacherId, active: true, role: { in: SCHOOL_TEACHING_ROLES } } });
        if (!teacherMembership) throw new SchoolApiError(400, 'Professor sem vínculo ativo nesta instituição.');
    }
    const offering = await prisma.$transaction(async (tx) => {
        const saved = await tx.subjectOffering.upsert({
            where: { schoolClassId_subjectId: { schoolClassId, subjectId } },
            create: { organizationId, schoolClassId, subjectId, teacherId, weeklyMinutes: body.weeklyMinutes === undefined ? 0 : integer(body.weeklyMinutes, 'weeklyMinutes', 0, 10_000) },
            update: { teacherId, active: true, weeklyMinutes: body.weeklyMinutes === undefined ? undefined : integer(body.weeklyMinutes, 'weeklyMinutes', 0, 10_000) },
            include: { subject: true, teacher: { select: { id: true, name: true } } }
        });
        await audit(tx, req.user!.id, 'SUBJECT_OFFERING_UPSERT', saved.id, schoolClassId);
        return saved;
    });
    res.status(201).json({ data: offering });
}));

router.put('/offerings/:offeringId/timetable', asyncHandler(async (req, res) => {
    const offeringId = uuid(req.params.offeringId, 'offeringId');
    const { organizationId } = await requireOfferingAccess(req.user!, offeringId);
    const body = bodyOf(req);
    const entries = arrayOf(body.entries, 'entries', 30).map((raw, index) => {
        const item = asObject(raw, `entries.${index}`);
        const dayOfWeek = integer(item.dayOfWeek, `entries.${index}.dayOfWeek`, 1, 7);
        const startMinute = integer(item.startMinute, `entries.${index}.startMinute`, 0, 1439);
        const endMinute = integer(item.endMinute, `entries.${index}.endMinute`, 1, 1440);
        if (endMinute <= startMinute) throw new SchoolApiError(400, 'Horário final deve ser posterior ao inicial.');
        return { offeringId, dayOfWeek, startMinute, endMinute, room: optionalText(item.room, `entries.${index}.room`, 80) };
    });
    await prisma.$transaction(async (tx) => {
        await tx.timetableEntry.deleteMany({ where: { offeringId } });
        if (entries.length) await tx.timetableEntry.createMany({ data: entries });
        await audit(tx, req.user!.id, 'TIMETABLE_REPLACE', offeringId, `${organizationId}:${entries.length}`);
    });
    res.json({ data: { offeringId, entries } });
}));

router.post('/offerings/:offeringId/sessions', asyncHandler(async (req, res) => {
    const offeringId = uuid(req.params.offeringId, 'offeringId');
    const { organizationId } = await requireOfferingAccess(req.user!, offeringId);
    const body = bodyOf(req);
    const termId = uuid(body.termId, 'termId');
    await assertTermForOffering(termId, offeringId);
    const session = await prisma.$transaction(async (tx) => {
        const created = await tx.classSession.create({ data: {
            offeringId, termId, createdById: req.user!.id,
            date: dateOnly(body.date, 'date'),
            startMinute: body.startMinute === undefined ? null : integer(body.startMinute, 'startMinute', 0, 1439),
            endMinute: body.endMinute === undefined ? null : integer(body.endMinute, 'endMinute', 1, 1440),
            topic: optionalText(body.topic, 'topic', 240),
            content: optionalText(body.content, 'content', 10_000),
            homework: optionalText(body.homework, 'homework', 5_000),
            status: body.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN',
        } });
        await audit(tx, req.user!.id, 'CLASS_SESSION_CREATE', created.id, offeringId);
        return created;
    });
    res.status(201).json({ data: session });
}));

router.put('/sessions/:sessionId/attendance', asyncHandler(async (req, res) => {
    const sessionId = uuid(req.params.sessionId, 'sessionId');
    const session = await prisma.classSession.findUnique({
        where: { id: sessionId },
        select: { offeringId: true, term: { select: { status: true } }, offering: { select: { schoolClassId: true, organizationId: true } } }
    });
    if (!session) throw new SchoolApiError(404, 'Sessão não encontrada.');
    assertOpenAcademicPeriod(session.term.status);
    await requireOfferingAccess(req.user!, session.offeringId);
    const body = bodyOf(req);
    const records = arrayOf(body.records, 'records', 500).map((raw, index) => {
        const item = asObject(raw, `records.${index}`);
        return {
            studentId: uuid(item.studentId, `records.${index}.studentId`),
            status: oneOf(item.status, `records.${index}.status`, Object.values(ClassAttendanceStatus)),
            minutesPresent: item.minutesPresent === undefined ? null : integer(item.minutesPresent, `records.${index}.minutesPresent`, 0, 1440),
            justification: optionalText(item.justification, `records.${index}.justification`, 2_000),
        };
    });
    assertUniqueStudents(records.map((item) => item.studentId));
    const enrolled = await prisma.schoolEnrollment.findMany({
        where: { schoolClassId: session.offering.schoolClassId, studentId: { in: records.map((item) => item.studentId) }, status: 'ACTIVE' },
        select: { studentId: true }
    });
    const enrolledIds = new Set(enrolled.map((item) => item.studentId));
    if (records.some((item) => !enrolledIds.has(item.studentId))) throw new SchoolApiError(400, 'Há estudante sem matrícula ativa na turma.');
    await prisma.$transaction(async (tx) => {
        for (const record of records) {
            await tx.classAttendanceRecord.upsert({
                where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
                create: { sessionId, ...record },
                update: { status: record.status, minutesPresent: record.minutesPresent, justification: record.justification }
            });
        }
        await tx.classSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } });
        await audit(tx, req.user!.id, 'CLASS_ATTENDANCE_BULK', sessionId, `${session.offering.organizationId}:${records.length}`);
    });
    res.json({ data: { sessionId, processed: records.length } });
}));

router.post('/offerings/:offeringId/assessments', asyncHandler(async (req, res) => {
    const offeringId = uuid(req.params.offeringId, 'offeringId');
    const { organizationId } = await requireOfferingAccess(req.user!, offeringId);
    const body = bodyOf(req);
    const termId = uuid(body.termId, 'termId');
    await assertTermForOffering(termId, offeringId);
    const assessment = await prisma.$transaction(async (tx) => {
        const created = await tx.assessment.create({ data: {
            offeringId, termId,
            title: text(body.title, 'title', 180),
            description: optionalText(body.description, 'description', 5_000),
            type: body.type ? oneOf(body.type, 'type', Object.values(AssessmentType)) : 'ASSIGNMENT',
            dueAt: dateTime(body.dueAt, 'dueAt'),
            maxScore: body.maxScore === undefined ? 10 : decimal(body.maxScore, 'maxScore', 0.01, 10_000),
            weight: body.weight === undefined ? 1 : decimal(body.weight, 'weight', 0, 1_000),
            published: booleanValue(body.published),
        } });
        await audit(tx, req.user!.id, 'ASSESSMENT_CREATE', created.id, offeringId);
        return created;
    });
    res.status(201).json({ data: assessment });
}));

router.put('/assessments/:assessmentId/grades', asyncHandler(async (req, res) => {
    const assessmentId = uuid(req.params.assessmentId, 'assessmentId');
    const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        select: { maxScore: true, offeringId: true, term: { select: { status: true } }, offering: { select: { schoolClassId: true, organizationId: true } } }
    });
    if (!assessment) throw new SchoolApiError(404, 'Avaliação não encontrada.');
    assertOpenAcademicPeriod(assessment.term.status);
    await requireOfferingAccess(req.user!, assessment.offeringId);
    const body = bodyOf(req);
    const grades = arrayOf(body.grades, 'grades', 500).map((raw, index) => {
        const item = asObject(raw, `grades.${index}`);
        return {
            studentId: uuid(item.studentId, `grades.${index}.studentId`),
            score: item.score === null ? null : decimal(item.score, `grades.${index}.score`, 0, assessment.maxScore),
            feedback: optionalText(item.feedback, `grades.${index}.feedback`, 5_000),
            status: item.status ? oneOf(item.status, `grades.${index}.status`, Object.values(GradeEntryStatus)) : 'DRAFT' as GradeEntryStatus,
        };
    });
    assertUniqueStudents(grades.map((item) => item.studentId));
    const enrolledCount = await prisma.schoolEnrollment.count({
        where: { schoolClassId: assessment.offering.schoolClassId, studentId: { in: grades.map((item) => item.studentId) }, status: 'ACTIVE' }
    });
    if (enrolledCount !== new Set(grades.map((item) => item.studentId)).size) throw new SchoolApiError(400, 'Há estudante sem matrícula ativa na turma.');
    await prisma.$transaction(async (tx) => {
        for (const grade of grades) {
            await tx.assessmentGrade.upsert({
                where: { assessmentId_studentId: { assessmentId, studentId: grade.studentId } },
                create: { assessmentId, ...grade, gradedAt: grade.status === 'PUBLISHED' ? new Date() : null },
                update: { score: grade.score, feedback: grade.feedback, status: grade.status, gradedAt: grade.status === 'PUBLISHED' ? new Date() : null }
            });
        }
        await audit(tx, req.user!.id, 'ASSESSMENT_GRADES_BULK', assessmentId, `${assessment.offering.organizationId}:${grades.length}`);
    });
    res.json({ data: { assessmentId, processed: grades.length } });
}));

router.post('/organizations/:organizationId/competencies', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_MANAGEMENT_ROLES);
    const body = bodyOf(req);
    const parentId = body.parentId ? uuid(body.parentId, 'parentId') : null;
    if (parentId) {
        const parent = await prisma.curriculumCompetency.findFirst({ where: { id: parentId, organizationId }, select: { id: true } });
        if (!parent) throw new SchoolApiError(404, 'Competência superior não encontrada nesta instituição.');
    }
    const competency = await prisma.$transaction(async (tx) => {
        const created = await tx.curriculumCompetency.create({ data: {
            organizationId,
            code: text(body.code, 'code', 80).toUpperCase(),
            title: text(body.title, 'title', 300),
            description: optionalText(body.description, 'description', 10_000),
            framework: optionalText(body.framework, 'framework', 80) || 'BNCC',
            stage: optionalText(body.stage, 'stage', 100),
            knowledgeArea: optionalText(body.knowledgeArea, 'knowledgeArea', 120),
            parentId,
        } });
        await audit(tx, req.user!.id, 'COMPETENCY_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: competency });
}));

router.post('/organizations/:organizationId/interventions', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, ['ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'COUNSELOR', 'TEACHER']);
    const body = bodyOf(req);
    const studentId = uuid(body.studentId, 'studentId');
    const activeEnrollment = await prisma.schoolEnrollment.findFirst({ where: { organizationId, studentId, status: 'ACTIVE' }, select: { id: true } });
    if (!activeEnrollment) throw new SchoolApiError(400, 'Aluno sem matrícula ativa na instituição.');
    const intervention = await prisma.$transaction(async (tx) => {
        const created = await tx.studentIntervention.create({ data: {
            organizationId, studentId,
            assignedToId: body.assignedToId ? uuid(body.assignedToId, 'assignedToId') : req.user!.id,
            title: text(body.title, 'title', 180),
            reason: text(body.reason, 'reason', 10_000),
            plan: optionalText(body.plan, 'plan', 10_000),
            riskLevel: body.riskLevel ? oneOf(body.riskLevel, 'riskLevel', Object.values(InterventionRiskLevel)) : 'MEDIUM',
            dueAt: dateTime(body.dueAt, 'dueAt'),
        } });
        await audit(tx, req.user!.id, 'INTERVENTION_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: intervention });
}));

router.post('/organizations/:organizationId/events', asyncHandler(async (req, res) => {
    const organizationId = uuid(req.params.organizationId, 'organizationId');
    await requireOrganizationAccess(req.user!, organizationId, SCHOOL_TEACHING_ROLES);
    const body = bodyOf(req);
    const startsAt = dateTime(body.startsAt, 'startsAt');
    if (!startsAt) throw new SchoolApiError(400, 'Data inicial obrigatória.');
    const endsAt = dateTime(body.endsAt, 'endsAt');
    if (endsAt) assertDateRange(startsAt, endsAt, 'evento');
    const campusId = body.campusId ? uuid(body.campusId, 'campusId') : null;
    const schoolClassId = body.schoolClassId ? uuid(body.schoolClassId, 'schoolClassId') : null;
    if (campusId) await assertCampusOrganization(campusId, organizationId);
    if (schoolClassId) await assertClassOrganization(schoolClassId, organizationId);
    const event = await prisma.$transaction(async (tx) => {
        const created = await tx.schoolEvent.create({ data: {
            organizationId,
            campusId,
            schoolClassId,
            title: text(body.title, 'title', 180),
            description: optionalText(body.description, 'description', 5_000),
            startsAt, endsAt,
            allDay: booleanValue(body.allDay),
            eventType: optionalText(body.eventType, 'eventType', 60) || 'ACADEMIC',
            createdById: req.user!.id,
        } });
        await audit(tx, req.user!.id, 'SCHOOL_EVENT_CREATE', created.id, organizationId);
        return created;
    });
    res.status(201).json({ data: event });
}));

router.get('/me/academic', asyncHandler(async (req, res) => {
    const [enrollments, dependents, teaching] = await Promise.all([
        prisma.schoolEnrollment.findMany({
            where: { studentId: req.user!.id, status: 'ACTIVE' },
            include: { schoolClass: { include: { campus: true, academicYear: true, offerings: { include: { subject: true, teacher: { select: { id: true, name: true } } } } } } }
        }),
        prisma.guardianLink.findMany({
            where: { guardianId: req.user!.id },
            include: { student: { select: { id: true, name: true, schoolEnrollments: { where: { status: 'ACTIVE' }, include: { schoolClass: true } } } } }
        }),
        prisma.subjectOffering.findMany({
            where: { teacherId: req.user!.id, active: true },
            include: { subject: true, schoolClass: { include: { campus: true, academicYear: true } }, timetable: true }
        })
    ]);
    res.json({ data: { enrollments, dependents, teaching } });
}));

router.get('/me/family', asyncHandler(async (req, res) => {
    if (req.user!.role !== 'GUARDIAN') {
        throw new SchoolApiError(403, 'Este recurso é exclusivo para responsáveis vinculados.');
    }

    const links = await prisma.guardianLink.findMany({
        where: { guardianId: req.user!.id },
        include: { student: { select: { id: true, name: true, email: true, registrationCode: true } } },
        orderBy: [{ primaryContact: 'desc' }, { student: { name: 'asc' } }]
    });

    const dependents = await Promise.all(links.map(async (link) => {
        const enrollments = await prisma.schoolEnrollment.findMany({
            where: { studentId: link.studentId, status: 'ACTIVE' },
            include: {
                organization: { select: { id: true, name: true, timezone: true } },
                schoolClass: {
                    include: {
                        campus: { select: { id: true, name: true } },
                        academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
                        offerings: {
                            where: { active: true },
                            include: {
                                subject: { select: { id: true, code: true, name: true } },
                                teacher: { select: { id: true, name: true } },
                                timetable: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }
                            },
                            orderBy: { subject: { name: 'asc' } }
                        }
                    }
                }
            },
            orderBy: { enrolledAt: 'desc' }
        });

        const classIds = enrollments.map((item) => item.schoolClassId);
        const campusIds = [...new Set(enrollments.map((item) => item.schoolClass.campusId))];
        const organizationIds = [...new Set(enrollments.map((item) => item.organizationId))];
        const eventScope = classIds.length === 0 ? [] : [
            { schoolClassId: { in: classIds } },
            { schoolClassId: null, campusId: { in: campusIds } },
            { schoolClassId: null, campusId: null },
        ];

        const [attendance, grades, events] = await Promise.all([
            prisma.classAttendanceRecord.findMany({
                where: { studentId: link.studentId, session: { offering: { schoolClassId: { in: classIds } } } },
                include: {
                    session: {
                        select: {
                            id: true, date: true, topic: true,
                            offering: { select: { subject: { select: { id: true, code: true, name: true } } } }
                        }
                    }
                },
                orderBy: { session: { date: 'desc' } },
                take: 80
            }),
            prisma.assessmentGrade.findMany({
                where: {
                    studentId: link.studentId,
                    status: 'PUBLISHED',
                    assessment: { published: true, offering: { schoolClassId: { in: classIds } } }
                },
                include: {
                    assessment: {
                        select: {
                            id: true, title: true, type: true, dueAt: true, maxScore: true, weight: true,
                            term: { select: { id: true, name: true } },
                            offering: { select: { subject: { select: { id: true, code: true, name: true } } } }
                        }
                    }
                },
                orderBy: { gradedAt: 'desc' },
                take: 100
            }),
            eventScope.length === 0 ? Promise.resolve([]) : prisma.schoolEvent.findMany({
                where: {
                    organizationId: { in: organizationIds },
                    startsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
                    OR: eventScope
                },
                select: { id: true, title: true, description: true, startsAt: true, endsAt: true, allDay: true, eventType: true },
                orderBy: { startsAt: 'asc' },
                take: 30
            })
        ]);

        return {
            relationship: link.relationship,
            primaryContact: link.primaryContact,
            financialResponsible: link.financialResponsible,
            pickupAuthorized: link.pickupAuthorized,
            student: link.student,
            enrollments,
            attendance,
            grades,
            events,
        };
    }));

    res.json({ data: { dependents } });
}));

router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SchoolApiError) {
        res.status(error.status).json({ message: error.message, requestId: req.id });
        return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ message: 'Já existe um registro com estes identificadores.', requestId: req.id });
        return;
    }
    logger.error({ error, requestId: req.id, path: req.path }, 'Erro no módulo escolar');
    next(error);
});

async function audit(tx: Prisma.TransactionClient, userId: string, action: string, target: string, details?: string) {
    await tx.auditLog.create({ data: { userId, action, target, details } });
}

function asObject(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchoolApiError(400, `Campo ${field} inválido.`);
    return value as Record<string, unknown>;
}

function todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function assertCampusOrganization(id: string, organizationId: string) {
    if (!await prisma.schoolCampus.findFirst({ where: { id, organizationId }, select: { id: true } })) {
        throw new SchoolApiError(404, 'Unidade não encontrada nesta instituição.');
    }
}

async function assertYearOrganization(id: string, organizationId: string) {
    if (!await prisma.academicYear.findFirst({ where: { id, organizationId }, select: { id: true } })) {
        throw new SchoolApiError(404, 'Ano letivo não encontrado nesta instituição.');
    }
}

async function assertTermOrganization(id: string, organizationId: string) {
    if (!await prisma.academicTerm.findFirst({ where: { id, academicYear: { organizationId } }, select: { id: true } })) {
        throw new SchoolApiError(404, 'Período letivo não encontrado nesta instituição.');
    }
}

async function assertTermForOffering(termId: string, offeringId: string) {
    const match = await prisma.academicTerm.findFirst({
        where: {
            id: termId,
            academicYear: { classes: { some: { offerings: { some: { id: offeringId } } } } }
        },
        select: { id: true, status: true }
    });
    if (!match) throw new SchoolApiError(400, 'Período não pertence ao ano letivo da turma.');
    assertOpenAcademicPeriod(match.status);
}

function assertOpenAcademicPeriod(status: string) {
    if (status === 'CLOSED' || status === 'ARCHIVED') {
        throw new SchoolApiError(409, 'O período letivo está fechado. Reabertura formal é necessária para alterar registros.');
    }
}

async function assertClassOrganization(id: string, organizationId: string) {
    if (!await prisma.schoolClass.findFirst({ where: { id, organizationId }, select: { id: true } })) {
        throw new SchoolApiError(404, 'Turma não encontrada nesta instituição.');
    }
}

function assertTermsDoNotOverlap(terms: Array<{ startDate: Date; endDate: Date }>) {
    const sorted = [...terms].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].startDate.getTime() <= sorted[index - 1].endDate.getTime()) {
            throw new SchoolApiError(400, 'Períodos letivos não podem se sobrepor.');
        }
    }
}

function assertUniqueStudents(studentIds: string[]) {
    if (new Set(studentIds).size !== studentIds.length) {
        throw new SchoolApiError(400, 'O lote contém estudante duplicado.');
    }
}

function qualityCheck(code: string, label: string, complete: number, total: number, severity: string) {
    const coveragePercent = total === 0 ? 100 : Math.round(complete / total * 100);
    return { code, label, severity, complete, total, missing: Math.max(0, total - complete), coveragePercent };
}

function oneRosterUser(person: { id: string; name: string; email: string; username?: string | null }, role: string, orgId: string, now: string) {
    const names = person.name.trim().split(/\s+/);
    return {
        sourcedId: person.id, status: 'active', dateLastModified: now,
        username: person.username || person.email,
        enabledUser: true,
        givenName: names[0] || person.name,
        familyName: names.slice(1).join(' ') || names[0] || person.name,
        email: person.email,
        roles: [{ roleType: role, role: role === 'student' ? 'student' : role === 'teacher' ? 'teacher' : 'administrator', org: { sourcedId: orgId } }],
    };
}

function oneRosterEnrollment(sourcedId: string, classId: string, userId: string, role: string, now: string) {
    return { sourcedId, status: 'active', dateLastModified: now, role, primary: role === 'teacher', user: { sourcedId: userId }, class: { sourcedId: classId } };
}

function isoDateOnly(value: Date) { return value.toISOString().slice(0, 10); }

function emailValue(value: unknown): string {
    const email = text(value, 'email', 254).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SchoolApiError(400, 'E-mail inválido.');
    return email;
}

function strongPassword(value: unknown): string {
    const password = text(value, 'temporaryPassword', 200);
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        throw new SchoolApiError(400, 'A senha temporária deve ter 10 caracteres e incluir maiúscula, minúscula, número e símbolo.');
    }
    return password;
}

export default router;
