import { describe, expect, it } from 'vitest';
import {
    isSelfTarget,
    isValidUserRole,
    parseUserListQuery,
    passwordValidationMessage,
    VALID_USER_ROLES,
} from '../modules/admin/userAdminPolicy';

describe('user admin policy', () => {
    it('mantém os papéis aceitos pelo contrato administrativo', () => {
        expect(VALID_USER_ROLES).toEqual(['ADMIN', 'TEACHER', 'STUDENT', 'STAFF', 'GUARDIAN']);
        expect(isValidUserRole('TEACHER')).toBe(true);
        expect(isValidUserRole('teacher')).toBe(false);
        expect(isValidUserRole(undefined)).toBe(false);
    });

    it('mantém a política de senha e suas mensagens', () => {
        expect(passwordValidationMessage('Ab1')).toBe('A senha deve ter pelo menos 8 caracteres.');
        expect(passwordValidationMessage('abcdefgh')).toBe(
            'A senha deve conter letras maiúsculas, minúsculas e números.',
        );
        expect(passwordValidationMessage('Senha123')).toBeNull();
    });

    it('limita e normaliza paginação e busca', () => {
        expect(parseUserListQuery({})).toEqual({ page: 1, limit: 50, search: '', skip: 0 });
        expect(parseUserListQuery({ page: '3', limit: '500', search: '  ana  ' }))
            .toEqual({ page: 3, limit: 100, search: 'ana', skip: 200 });
        expect(parseUserListQuery({ page: '-2', limit: '0' }))
            .toEqual({ page: 1, limit: 1, search: '', skip: 0 });
    });

    it('impede operações destrutivas sobre a própria conta', () => {
        expect(isSelfTarget('admin-1', 'admin-1')).toBe(true);
        expect(isSelfTarget('admin-1', 'user-2')).toBe(false);
    });
});
