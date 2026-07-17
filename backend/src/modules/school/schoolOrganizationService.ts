import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import type { JwtPayload } from '../../middleware/authMiddleware';
import { requireOrganizationAccess } from './access';
import {
    SchoolApiError,
    arrayOf,
    assertDateRange,
    dateOnly,
    optionalText,
    slug,
    text,
} from './validation';

interface AcademicTermPeriod {
    name: string;
    order: number;
    startDate: Date;
    endDate: Date;
}

export async function setupSchoolOrganization(actor: JwtPayload, body: Record<string, unknown>) {
    if (actor.role !== 'ADMIN') {
        throw new SchoolApiError(403, 'Somente administrador global pode criar instituições.');
    }

    const organizationName = text(body.name, 'name', 160);
    const organizationSlug = slug(body.slug);
    const campusInput = objectValue(body.campus, 'campus');
    const yearInput = objectValue(body.academicYear, 'academicYear');
    const startDate = dateOnly(yearInput.startDate, 'academicYear.startDate');
    const endDate = dateOnly(yearInput.endDate, 'academicYear.endDate');
    assertDateRange(startDate, endDate, 'ano letivo');
    const terms = parseAcademicTerms(yearInput.terms, startDate, endDate, 'academicYear.terms', 'terms');

    return prisma.$transaction(async (tx) => {
        const created = await tx.schoolOrganization.create({
            data: {
                name: organizationName,
                slug: organizationSlug,
                legalName: optionalText(body.legalName, 'legalName', 200),
                inepCode: optionalText(body.inepCode, 'inepCode', 20),
                timezone: optionalText(body.timezone, 'timezone', 80) || 'America/Sao_Paulo',
                status: 'ACTIVE',
                memberships: { create: { userId: actor.id, role: 'ORGANIZATION_ADMIN' } },
                campuses: {
                    create: {
                        code: text(campusInput.code, 'campus.code', 40).toUpperCase(),
                        name: text(campusInput.name, 'campus.name', 160),
                        inepCode: optionalText(campusInput.inepCode, 'campus.inepCode', 20),
                        email: optionalText(campusInput.email, 'campus.email', 200),
                        phone: optionalText(campusInput.phone, 'campus.phone', 40),
                    },
                },
                academicYears: {
                    create: {
                        name: text(yearInput.name, 'academicYear.name', 80),
                        startDate,
                        endDate,
                        status: 'ACTIVE',
                        terms: { create: terms },
                    },
                },
            },
            select: { id: true, slug: true, name: true },
        });
        await audit(tx, actor.id, 'SCHOOL_SETUP', created.id, created.slug);
        return created;
    });
}

export async function getSchoolBootstrap(actor: JwtPayload, organizationId: string) {
    await requireOrganizationAccess(actor, organizationId);
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
                    _count: { select: { enrollments: true, offerings: true } },
                },
                orderBy: [{ academicYear: { startDate: 'desc' } }, { name: 'asc' }],
            },
            memberships: {
                where: { active: true },
                include: {
                    user: { select: { id: true, name: true, email: true, role: true } },
                    campus: { select: { id: true, name: true } },
                },
                orderBy: { user: { name: 'asc' } },
            },
        },
    });
    if (!organization) throw new SchoolApiError(404, 'Instituição não encontrada.');
    return organization;
}

export function parseAcademicTerms(
    rawTerms: unknown,
    academicYearStart: Date,
    academicYearEnd: Date,
    field = 'terms',
    itemField = field,
): AcademicTermPeriod[] {
    const terms = arrayOf(rawTerms, field, 12).map((raw, index) => {
        const item = objectValue(raw, `${itemField}.${index}`);
        const termStart = dateOnly(item.startDate, `${itemField}.${index}.startDate`);
        const termEnd = dateOnly(item.endDate, `${itemField}.${index}.endDate`);
        assertDateRange(termStart, termEnd, `período ${index + 1}`);
        if (termStart < academicYearStart || termEnd > academicYearEnd) {
            throw new SchoolApiError(400, 'Período fora do ano letivo.');
        }
        return {
            name: text(item.name, `${itemField}.${index}.name`, 80),
            order: index + 1,
            startDate: termStart,
            endDate: termEnd,
        };
    });
    if (!terms.length) throw new SchoolApiError(400, 'Informe ao menos um período letivo.');
    assertTermsDoNotOverlap(terms);
    return terms;
}

export function assertTermsDoNotOverlap(terms: Array<{ startDate: Date; endDate: Date }>): void {
    const sorted = [...terms].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].startDate.getTime() <= sorted[index - 1].endDate.getTime()) {
            throw new SchoolApiError(400, 'Períodos letivos não podem se sobrepor.');
        }
    }
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new SchoolApiError(400, `Campo ${field} inválido.`);
    }
    return value as Record<string, unknown>;
}

async function audit(tx: Prisma.TransactionClient, userId: string, action: string, target: string, details?: string) {
    await tx.auditLog.create({ data: { userId, action, target, details } });
}
