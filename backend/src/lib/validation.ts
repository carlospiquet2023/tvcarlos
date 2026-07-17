export type ValidationIssue = 'INVALID_INPUT' | 'UNKNOWN_FIELDS';

export type ValidationErrorFactory = (issue: ValidationIssue, message: string) => Error;

export interface ValidationMessages {
    object(): string;
    unknownFields(fields: string[]): string;
    required(field: string): string;
    tooLong(field: string, maximum: number): string;
    uuid(field: string): string;
    enum(field: string, allowed: readonly string[]): string;
}

export interface InputValidatorOptions {
    messages?: Partial<ValidationMessages>;
    uuidPattern?: RegExp;
    uuidMaximum?: number | null;
    unwrapArrays?: boolean;
}

const defaultMessages: ValidationMessages = {
    object: () => 'Envie um objeto JSON valido.',
    unknownFields: (fields) => `Campos nao reconhecidos: ${fields.join(', ')}.`,
    required: (field) => `${field} e obrigatorio.`,
    tooLong: (field, maximum) => `${field} excede ${maximum} caracteres.`,
    uuid: (field) => `${field} deve ser um UUID valido.`,
    enum: (field, allowed) => `${field} deve ser um de: ${allowed.join(', ')}.`,
};

const defaultUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Primitivas de validação independentes do contrato HTTP de cada domínio.
 * O chamador controla o tipo de erro e pode preservar seu envelope/código.
 */
export function createInputValidator(
    errorFactory: ValidationErrorFactory,
    options: InputValidatorOptions = {},
) {
    const messages: ValidationMessages = { ...defaultMessages, ...options.messages };
    const uuidPattern = options.uuidPattern ?? defaultUuidPattern;
    const uuidMaximum = options.uuidMaximum === null ? undefined : (options.uuidMaximum ?? 64);

    const fail = (issue: ValidationIssue, message: string): never => {
        throw errorFactory(issue, message);
    };

    const requiredText = (value: unknown, field: string, maximum?: number): string => {
        if (typeof value !== 'string' || !value.trim()) {
            return fail('INVALID_INPUT', messages.required(field));
        }
        const text = value.trim();
        if (maximum !== undefined && text.length > maximum) {
            return fail('INVALID_INPUT', messages.tooLong(field, maximum));
        }
        return text;
    };

    const requiredUuid = (value: unknown, field: string): string => {
        const scalar = options.unwrapArrays !== false && Array.isArray(value) ? value[0] : value;
        const text = requiredText(scalar, field, uuidMaximum);
        if (!uuidPattern.test(text)) return fail('INVALID_INPUT', messages.uuid(field));
        return text;
    };

    return {
        requireObject(value: unknown): Record<string, unknown> {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                return fail('INVALID_INPUT', messages.object());
            }
            return value as Record<string, unknown>;
        },

        rejectUnknownKeys(object: Record<string, unknown>, allowed: readonly string[]): void {
            const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
            if (unknown.length) fail('UNKNOWN_FIELDS', messages.unknownFields(unknown));
        },

        requiredText,

        optionalText(value: unknown, field: string, maximum?: number): string | undefined {
            if (value === undefined || value === null || value === '') return undefined;
            return requiredText(value, field, maximum);
        },

        nullableText(value: unknown, field: string, maximum?: number): string | null {
            if (value === undefined || value === null || value === '') return null;
            return requiredText(value, field, maximum);
        },

        requiredUuid,

        optionalUuid(value: unknown, field: string): string | undefined {
            if (value === undefined || value === null || value === '') return undefined;
            return requiredUuid(value, field);
        },

        enumValue<const T extends readonly string[]>(
            value: unknown,
            field: string,
            allowed: T,
        ): T[number] {
            if (typeof value !== 'string' || !allowed.includes(value.toUpperCase())) {
                return fail('INVALID_INPUT', messages.enum(field, allowed));
            }
            return value.toUpperCase() as T[number];
        },
    };
}
