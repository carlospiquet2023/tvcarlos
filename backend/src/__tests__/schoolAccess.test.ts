import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JwtPayload } from '../middleware/authMiddleware';

const mocks = vi.hoisted(() => ({
    membershipFindUnique: vi.fn(),
    offeringFindUnique: vi.fn(),
    classFindFirst: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    default: {
        schoolMembership: { findUnique: mocks.membershipFindUnique },
        subjectOffering: { findUnique: mocks.offeringFindUnique },
        schoolClass: { findFirst: mocks.classFindFirst },
    },
}));

import {
    assertCampusScope,
    requireClassAccess,
    requireOfferingAccess,
    requireOrganizationAccess,
} from '../modules/school/access';
import { SchoolApiError } from '../modules/school/validation';

const ACTOR: JwtPayload = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'TEACHER',
    ver: 0,
};

describe('school tenant access', () => {
    beforeEach(() => vi.clearAllMocks());

    it('bypasses school membership only for a global administrator', async () => {
        await expect(requireOrganizationAccess({ ...ACTOR, role: 'ADMIN' }, 'org')).resolves.toBeNull();
        expect(mocks.membershipFindUnique).not.toHaveBeenCalled();
    });

    it('rejects inactive memberships and roles outside the policy', async () => {
        mocks.membershipFindUnique.mockResolvedValue({ id: 'membership', role: 'TEACHER', campusId: null, active: false });
        await expect(requireOrganizationAccess(ACTOR, 'org')).rejects.toMatchObject({ status: 403 });

        mocks.membershipFindUnique.mockResolvedValue({ id: 'membership', role: 'STUDENT', campusId: null, active: true });
        await expect(requireOrganizationAccess(ACTOR, 'org', ['TEACHER'])).rejects.toMatchObject({ status: 403 });
    });

    it('enforces a campus-scoped membership', () => {
        expect(() => assertCampusScope({ campusId: 'campus-a' }, 'campus-a')).not.toThrow();
        expect(() => assertCampusScope(null, 'campus-b')).not.toThrow();
        expect(() => assertCampusScope({ campusId: 'campus-a' }, 'campus-b')).toThrow(SchoolApiError);
    });

    it('rejects an offering in another campus even when assigned to the teacher', async () => {
        mocks.offeringFindUnique.mockResolvedValue({
            organizationId: 'org', teacherId: ACTOR.id, schoolClass: { campusId: 'campus-b' },
        });
        mocks.membershipFindUnique.mockResolvedValue({
            id: 'membership', role: 'TEACHER', campusId: 'campus-a', active: true,
        });
        await expect(requireOfferingAccess(ACTOR, 'offering')).rejects.toMatchObject({ status: 403 });
    });

    it('requires both campus scope and teacher assignment for class access', async () => {
        mocks.classFindFirst.mockResolvedValue({ id: 'class', campusId: 'campus-a', offerings: [] });
        mocks.membershipFindUnique.mockResolvedValue({
            id: 'membership', role: 'TEACHER', campusId: 'campus-a', active: true,
        });
        await expect(requireClassAccess(ACTOR, 'org', 'class')).rejects.toMatchObject({
            status: 403,
            message: 'Você não está atribuído a esta turma.',
        });
    });
});
