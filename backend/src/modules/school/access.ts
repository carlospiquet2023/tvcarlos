import { SchoolRole } from '@prisma/client';
import prisma from '../../lib/prisma';
import { JwtPayload } from '../../middleware/authMiddleware';
import { SchoolApiError } from './validation';

export const SCHOOL_READ_ROLES = Object.values(SchoolRole);
export const SCHOOL_MANAGEMENT_ROLES: SchoolRole[] = [
    'ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'SECRETARY'
];
export const SCHOOL_TEACHING_ROLES: SchoolRole[] = [
    ...SCHOOL_MANAGEMENT_ROLES, 'TEACHER'
];

export async function requireOrganizationAccess(
    actor: JwtPayload,
    organizationId: string,
    allowedRoles: readonly SchoolRole[] = SCHOOL_READ_ROLES,
) {
    if (actor.role === 'ADMIN') return null;

    const membership = await prisma.schoolMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId: actor.id } },
        select: { id: true, role: true, campusId: true, active: true }
    });
    if (!membership?.active || !allowedRoles.includes(membership.role)) {
        throw new SchoolApiError(403, 'Você não possui permissão nesta instituição.');
    }
    return membership;
}

export async function requireOfferingAccess(actor: JwtPayload, offeringId: string): Promise<{ organizationId: string }> {
    const offering = await prisma.subjectOffering.findUnique({
        where: { id: offeringId },
        select: { organizationId: true, teacherId: true }
    });
    if (!offering) throw new SchoolApiError(404, 'Oferta de disciplina não encontrada.');
    const membership = await requireOrganizationAccess(actor, offering.organizationId, SCHOOL_TEACHING_ROLES);
    if (actor.role !== 'ADMIN' && membership?.role === 'TEACHER' && offering.teacherId !== actor.id) {
        throw new SchoolApiError(403, 'Esta oferta não está atribuída a você.');
    }
    return { organizationId: offering.organizationId };
}

export async function requireClassAccess(actor: JwtPayload, organizationId: string, schoolClassId: string) {
    const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: schoolClassId, organizationId },
        select: { id: true, offerings: { where: { teacherId: actor.id, active: true }, select: { id: true }, take: 1 } }
    });
    if (!schoolClass) throw new SchoolApiError(404, 'Turma não encontrada.');
    if (actor.role === 'ADMIN') return schoolClass;

    const membership = await requireOrganizationAccess(actor, organizationId, SCHOOL_TEACHING_ROLES);
    if (membership?.role === 'TEACHER' && schoolClass.offerings.length === 0) {
        throw new SchoolApiError(403, 'Você não está atribuído a esta turma.');
    }
    return schoolClass;
}
