import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === 'true'
    || process.env.npm_lifecycle_event === 'test:integration:db';
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();

class InvalidWriteWasAccepted extends Error {}

describeDatabase('school PostgreSQL tenant integrity', () => {
    beforeAll(async () => {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL é obrigatória para os testes de integração PostgreSQL.');
        }
        await prisma.$queryRaw`SELECT 1`;

        const expectedConstraints = [
            'SchoolClass_academicYearId_organizationId_fkey',
            'SchoolClass_campusId_organizationId_fkey',
            'SchoolEnrollment_schoolClassId_organizationId_fkey',
            'SubjectOffering_schoolClassId_organizationId_fkey',
            'SubjectOffering_subjectId_organizationId_fkey',
        ];
        const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
            SELECT conname AS name
            FROM pg_constraint
            WHERE conname IN (
                'SchoolClass_campusId_organizationId_fkey',
                'SchoolClass_academicYearId_organizationId_fkey',
                'SchoolEnrollment_schoolClassId_organizationId_fkey',
                'SubjectOffering_schoolClassId_organizationId_fkey',
                'SubjectOffering_subjectId_organizationId_fkey'
            )
        `;
        expect(constraints.map((item) => item.name).sort()).toEqual(expectedConstraints.sort());

        const triggers = await prisma.$queryRaw<Array<{ name: string }>>`
            SELECT tgname AS name
            FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgname IN (
                'ClassSession_academic_year_scope_trigger',
                'Assessment_academic_year_scope_trigger',
                'AcademicTerm_parent_scope_trigger',
                'SchoolClass_parent_scope_trigger',
                'SubjectOffering_parent_scope_trigger',
                'SchoolCampus_organization_immutable_trigger',
                'AcademicYear_organization_immutable_trigger',
                'SchoolSubject_organization_immutable_trigger',
                'SchoolClass_organization_immutable_trigger',
                'SubjectOffering_organization_immutable_trigger'
              )
        `;
        expect(triggers.map((item) => item.name).sort()).toEqual([
            'AcademicTerm_parent_scope_trigger',
            'AcademicYear_organization_immutable_trigger',
            'Assessment_academic_year_scope_trigger',
            'ClassSession_academic_year_scope_trigger',
            'SchoolCampus_organization_immutable_trigger',
            'SchoolClass_organization_immutable_trigger',
            'SchoolClass_parent_scope_trigger',
            'SchoolSubject_organization_immutable_trigger',
            'SubjectOffering_organization_immutable_trigger',
            'SubjectOffering_parent_scope_trigger',
        ]);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('rejects a class whose campus belongs to another organization', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const organizationA = await createOrganization(tx, 'class-a');
            const organizationB = await createOrganization(tx, 'class-b');
            const campusB = await createCampus(tx, organizationB.id, 'B');
            const yearA = await createAcademicYear(tx, organizationA.id, 'Ano A');

            await tx.schoolClass.create({
                data: {
                    organizationId: organizationA.id,
                    campusId: campusB.id,
                    academicYearId: yearA.id,
                    code: 'CROSS-CAMPUS',
                    name: 'Turma inválida',
                    gradeLevel: '7º ano',
                },
            });
        });

        expectConstraintError(rejection, ['P2003']);
    });

    it('rejects an enrollment whose organization differs from the class', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const organizationA = await createOrganization(tx, 'enrollment-a');
            const organizationB = await createOrganization(tx, 'enrollment-b');
            const campusA = await createCampus(tx, organizationA.id, 'A');
            const yearA = await createAcademicYear(tx, organizationA.id, 'Ano A');
            const schoolClass = await tx.schoolClass.create({
                data: {
                    organizationId: organizationA.id,
                    campusId: campusA.id,
                    academicYearId: yearA.id,
                    code: 'CLASS-A',
                    name: 'Turma A',
                    gradeLevel: '8º ano',
                },
            });
            const student = await createUser(tx, 'student');

            await tx.schoolEnrollment.create({
                data: {
                    organizationId: organizationB.id,
                    schoolClassId: schoolClass.id,
                    studentId: student.id,
                },
            });
        });

        expectConstraintError(rejection, ['P2003']);
    });

    it('rejects a class session in a term from another academic year', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const organization = await createOrganization(tx, 'term-scope');
            const campus = await createCampus(tx, organization.id, 'A');
            const yearA = await createAcademicYear(tx, organization.id, 'Ano A');
            const yearB = await createAcademicYear(tx, organization.id, 'Ano B');
            const termB = await tx.academicTerm.create({
                data: {
                    academicYearId: yearB.id,
                    name: 'Primeiro período B',
                    order: 1,
                    startDate: new Date('2027-02-01T00:00:00.000Z'),
                    endDate: new Date('2027-06-30T00:00:00.000Z'),
                },
            });
            const schoolClass = await tx.schoolClass.create({
                data: {
                    organizationId: organization.id,
                    campusId: campus.id,
                    academicYearId: yearA.id,
                    code: 'CLASS-YEAR-A',
                    name: 'Turma do ano A',
                    gradeLevel: '9º ano',
                },
            });
            const subject = await tx.schoolSubject.create({
                data: { organizationId: organization.id, code: 'MAT', name: 'Matemática' },
            });
            const offering = await tx.subjectOffering.create({
                data: {
                    organizationId: organization.id,
                    schoolClassId: schoolClass.id,
                    subjectId: subject.id,
                },
            });
            const creator = await createUser(tx, 'creator');

            await tx.classSession.create({
                data: {
                    offeringId: offering.id,
                    termId: termB.id,
                    date: new Date('2026-03-01T00:00:00.000Z'),
                    createdById: creator.id,
                },
            });
        });

        expectConstraintError(rejection, ['P2004', '23514']);
        expect(errorDetails(rejection)).toContain('another academic year');
    });

    it('rejects moving a term when existing sessions belong to another class year', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const fixture = await createAcademicFixture(tx, 'move-term');
            await tx.academicTerm.update({
                where: { id: fixture.termA.id },
                data: { academicYearId: fixture.yearB.id },
            });
        });

        expectConstraintError(rejection, ['P2004', '23514']);
        expect(errorDetails(rejection)).toContain('AcademicTerm move');
    });

    it('rejects moving a class to another year when sessions use the original term', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const fixture = await createAcademicFixture(tx, 'move-class-year');
            await tx.schoolClass.update({
                where: { id: fixture.classA.id },
                data: { academicYearId: fixture.yearB.id },
            });
        });

        expectConstraintError(rejection, ['P2004', '23514']);
        expect(errorDetails(rejection)).toContain('academic year change');
    });

    it('rejects moving an offering to a class from another year when it has sessions', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const fixture = await createAcademicFixture(tx, 'move-offering');
            await tx.$executeRaw`
                UPDATE "SubjectOffering"
                SET "schoolClassId" = ${fixture.classB.id}
                WHERE "id" = ${fixture.offering.id}
            `;
        });

        expectConstraintError(rejection, ['P2004', 'P2010', '23514']);
        expect(errorDetails(rejection)).toContain('SubjectOffering class change');
    });

    it('rejects moving a class campus when an event explicitly uses the original campus', async () => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const fixture = await createAcademicFixture(tx, 'move-campus');
            await tx.schoolEvent.create({
                data: {
                    organizationId: fixture.organization.id,
                    campusId: fixture.campusA.id,
                    schoolClassId: fixture.classA.id,
                    title: 'Evento da turma',
                    startsAt: new Date('2026-04-10T12:00:00.000Z'),
                    createdById: fixture.creator.id,
                },
            });
            await tx.schoolClass.update({
                where: { id: fixture.classA.id },
                data: { campusId: fixture.campusB.id },
            });
        });

        expectConstraintError(rejection, ['P2004', '23514']);
        expect(errorDetails(rejection)).toContain('campus change');
    });

    it.each([
        'SchoolCampus',
        'AcademicYear',
        'SchoolSubject',
        'SchoolClass',
        'SubjectOffering',
    ])('rejects changing organization ownership of %s', async (table) => {
        const rejection = await captureRejectedWrite(async (tx) => {
            const fixture = await createAcademicFixture(tx, `ownership-${table}`);
            const otherOrganization = await createOrganization(tx, `other-${table}`);
            const idByTable: Record<string, string> = {
                SchoolCampus: fixture.campusA.id,
                AcademicYear: fixture.yearA.id,
                SchoolSubject: fixture.subject.id,
                SchoolClass: fixture.classA.id,
                SubjectOffering: fixture.offering.id,
            };
            await tx.$executeRawUnsafe(
                `UPDATE "${table}" SET "organizationId" = $1 WHERE "id" = $2`,
                otherOrganization.id,
                idByTable[table],
            );
        });

        expectConstraintError(rejection, ['P2010', '23514']);
        expect(errorDetails(rejection)).toContain('organization ownership is immutable');
    });
});

async function captureRejectedWrite(
    write: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<unknown> {
    try {
        await prisma.$transaction(async (tx) => {
            await write(tx);
            // This guarantees rollback and cleanup if the database incorrectly
            // accepts the invalid write.
            throw new InvalidWriteWasAccepted('O banco aceitou uma escrita escolar inválida.');
        }, { maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
        if (error instanceof InvalidWriteWasAccepted) {
            throw error;
        }
        return error;
    }
    throw new Error('A transação de teste terminou sem rejeição.');
}

function expectConstraintError(error: unknown, expectedCodes: string[]): void {
    expect(error).toBeInstanceOf(Error);
    const details = errorDetails(error);
    const prismaCode = (error as { code?: string }).code;
    const postgresCode = details.match(/PostgresError\s*\{\s*code:\s*"([0-9A-Z]+)"/)?.[1];
    expect(expectedCodes, details).toContain(prismaCode ?? postgresCode);
}

function errorDetails(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const code = (error as { code?: string }).code;
    const meta = (error as { meta?: unknown }).meta;
    return `${code ?? ''} ${error.message} ${JSON.stringify(meta)}`;
}

async function createOrganization(tx: Prisma.TransactionClient, label: string) {
    const suffix = randomUUID();
    return tx.schoolOrganization.create({
        data: { name: `DB Integration ${label}`, slug: `db-int-${suffix}` },
        select: { id: true },
    });
}

async function createCampus(tx: Prisma.TransactionClient, organizationId: string, code: string) {
    return tx.schoolCampus.create({
        data: { organizationId, code: `${code}-${randomUUID()}`, name: `Campus ${code}` },
        select: { id: true },
    });
}

async function createAcademicYear(tx: Prisma.TransactionClient, organizationId: string, name: string) {
    const offset = name.endsWith('B') ? 1 : 0;
    return tx.academicYear.create({
        data: {
            organizationId,
            name: `${name}-${randomUUID()}`,
            startDate: new Date(`${2026 + offset}-02-01T00:00:00.000Z`),
            endDate: new Date(`${2026 + offset}-11-30T00:00:00.000Z`),
        },
        select: { id: true },
    });
}

async function createUser(tx: Prisma.TransactionClient, label: string) {
    const suffix = randomUUID();
    return tx.user.create({
        data: {
            email: `db-int-${label}-${suffix}@example.invalid`,
            password: 'not-used-in-integration-test',
            name: `DB Integration ${label}`,
        },
        select: { id: true },
    });
}

async function createAcademicFixture(tx: Prisma.TransactionClient, label: string) {
    const organization = await createOrganization(tx, label);
    const campusA = await createCampus(tx, organization.id, 'A');
    const campusB = await createCampus(tx, organization.id, 'B');
    const yearA = await createAcademicYear(tx, organization.id, 'Ano A');
    const yearB = await createAcademicYear(tx, organization.id, 'Ano B');
    const termA = await tx.academicTerm.create({
        data: {
            academicYearId: yearA.id,
            name: `Primeiro período-${randomUUID()}`,
            order: 1,
            startDate: new Date('2026-02-01T00:00:00.000Z'),
            endDate: new Date('2026-06-30T00:00:00.000Z'),
        },
        select: { id: true },
    });
    const classA = await tx.schoolClass.create({
        data: {
            organizationId: organization.id,
            campusId: campusA.id,
            academicYearId: yearA.id,
            code: `A-${randomUUID()}`,
            name: 'Turma A',
            gradeLevel: '9º ano',
        },
        select: { id: true },
    });
    const classB = await tx.schoolClass.create({
        data: {
            organizationId: organization.id,
            campusId: campusB.id,
            academicYearId: yearB.id,
            code: `B-${randomUUID()}`,
            name: 'Turma B',
            gradeLevel: '9º ano',
        },
        select: { id: true },
    });
    const subject = await tx.schoolSubject.create({
        data: {
            organizationId: organization.id,
            code: `SUB-${randomUUID()}`,
            name: 'Disciplina de integração',
        },
        select: { id: true },
    });
    const offering = await tx.subjectOffering.create({
        data: {
            organizationId: organization.id,
            schoolClassId: classA.id,
            subjectId: subject.id,
        },
        select: { id: true },
    });
    const creator = await createUser(tx, `creator-${label}`);
    await tx.classSession.create({
        data: {
            offeringId: offering.id,
            termId: termA.id,
            date: new Date('2026-03-01T00:00:00.000Z'),
            createdById: creator.id,
        },
    });
    return {
        organization,
        campusA,
        campusB,
        yearA,
        yearB,
        termA,
        classA,
        classB,
        subject,
        offering,
        creator,
    };
}
