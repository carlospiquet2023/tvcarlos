import { describe, expect, it } from 'vitest';
import { createInputValidator, type ValidationIssue } from '../lib/validation';

class DomainValidationError extends Error {
    constructor(public readonly issue: ValidationIssue, message: string) {
        super(message);
    }
}

const validator = createInputValidator((issue, message) => new DomainValidationError(issue, message));

describe('createInputValidator', () => {
    it('valida objeto e rejeita arrays', () => {
        expect(validator.requireObject({ name: 'Ada' })).toEqual({ name: 'Ada' });
        expect(() => validator.requireObject([])).toThrow('Envie um objeto JSON valido.');
    });

    it('preserva a categoria de campos desconhecidos', () => {
        try {
            validator.rejectUnknownKeys({ name: 'Ada', role: 'ADMIN' }, ['name']);
            throw new Error('deveria falhar');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainValidationError);
            expect(error).toMatchObject({
                issue: 'UNKNOWN_FIELDS',
                message: 'Campos nao reconhecidos: role.',
            });
        }
    });

    it('normaliza texto e aplica limite', () => {
        expect(validator.requiredText('  texto  ', 'title', 10)).toBe('texto');
        expect(() => validator.requiredText('texto longo', 'title', 5))
            .toThrow('title excede 5 caracteres.');
    });

    it('distingue texto opcional e anulável', () => {
        expect(validator.optionalText('', 'title', 10)).toBeUndefined();
        expect(validator.nullableText(undefined, 'title', 10)).toBeNull();
    });

    it('aceita UUID de parâmetro em array e rejeita valor inválido', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        expect(validator.requiredUuid([uuid], 'id')).toBe(uuid);
        expect(() => validator.requiredUuid('not-a-uuid', 'id')).toThrow('id deve ser um UUID valido.');
    });

    it('normaliza enum sem perder o tipo permitido', () => {
        expect(validator.enumValue('active', 'status', ['ACTIVE', 'INACTIVE'] as const)).toBe('ACTIVE');
        expect(() => validator.enumValue('deleted', 'status', ['ACTIVE', 'INACTIVE'] as const))
            .toThrow('status deve ser um de: ACTIVE, INACTIVE.');
    });

    it('permite mensagens e versão UUID específicas do domínio', () => {
        const privateValidator = createInputValidator(
            (_issue, message) => new Error(message),
            {
                messages: {
                    required: (field) => `Missing or invalid ${field}`,
                    uuid: (field) => `Missing or invalid UUID ${field}`,
                },
                uuidPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
                uuidMaximum: null,
            },
        );

        expect(() => privateValidator.requiredText('', 'slug')).toThrow('Missing or invalid slug');
        expect(() => privateValidator.requiredUuid(
            '123e4567-e89b-82d3-a456-426614174000',
            'id',
        )).toThrow('Missing or invalid UUID id');
    });
});
