import { describe, expect, it } from 'vitest';
import {
    generateStudentCredentials,
    isDeliverableEmailAddress,
    isValidEmailAddress,
    normalizeImportHeader,
} from '../modules/admin/studentImport';

describe('student import helpers', () => {
    it('normalizes spreadsheet headers consistently', () => {
        expect(normalizeImportHeader('  Matrícula do Aluno  ')).toBe('matriculadoaluno');
        expect(normalizeImportHeader('turma/curso')).toBe('turmacurso');
    });

    it('generates non-repeating temporary credentials while preserving the legacy login contract', () => {
        const first = generateStudentCredentials('João Silva', '123.456.789-00');
        const second = generateStudentCredentials('João Silva', '123.456.789-00');
        expect(first.email).toBe('joosilva@alunos.com');
        expect(first.password).toContain('8900');
        expect(first.password).not.toBe(second.password);
    });

    it('distinguishes real delivery addresses from technical student logins', () => {
        expect(isValidEmailAddress('aluno@example.com')).toBe(true);
        expect(isDeliverableEmailAddress('aluno@example.com')).toBe(true);
        expect(isDeliverableEmailAddress('aluno@alunos.com')).toBe(false);
        expect(isValidEmailAddress('endereco-invalido')).toBe(false);
    });
});
