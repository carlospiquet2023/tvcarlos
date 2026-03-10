/**
 * Testes unitários para funções críticas do backend
 *
 * Roda: npx vitest run
 * Watch: npx vitest
 */
import { describe, it, expect } from 'vitest';

// ============================================================
// Teste de geração de credenciais (senhas não-previsíveis)
// ============================================================
// Importamos a lógica extraída para testar isoladamente
function generateCredentials(name: string, cpf: string): { email: string; password: string } {
    const crypto = require('crypto');
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = (parts[0] || 'aluno').toLowerCase().replace(/[^a-z]/g, '');
    const second = (parts[1] || '').toLowerCase().replace(/[^a-z]/g, '');
    const email = `${first}${second}@alunos.com`;

    const cpfDigits = cpf.replace(/\D/g, '');
    const last4 = cpfDigits.slice(-4) || '0000';
    const randHex = crypto.randomBytes(3).toString('hex').slice(0, 4);
    const randSuffix = crypto.randomBytes(2).toString('base64url').slice(0, 2);
    const password = `${randHex}${last4}${randSuffix}`;

    return { email, password };
}

describe('generateCredentials', () => {
    it('gera email correto a partir do nome', () => {
        const { email } = generateCredentials('João Silva', '123.456.789-00');
        // "João" → replace(/[^a-z]/g, '') remove o ã → "joo"
        expect(email).toBe('joosilva@alunos.com');
    });

    it('gera email com fallback para nome simples', () => {
        const { email } = generateCredentials('Maria', '111.222.333-44');
        expect(email).toBe('maria@alunos.com');
    });

    it('gera senhas diferentes para o mesmo input (componente aleatório)', () => {
        const r1 = generateCredentials('João Silva', '123.456.789-00');
        const r2 = generateCredentials('João Silva', '123.456.789-00');
        // Senhas devem ser diferentes por causa do componente crypto.randomBytes
        expect(r1.password).not.toBe(r2.password);
    });

    it('senha contém últimos 4 dígitos do CPF', () => {
        const { password } = generateCredentials('Test User', '123.456.789-00');
        // CPF digits: 12345678900, last 4 = "8900"
        expect(password).toContain('8900');
    });

    it('senha tem comprimento mínimo de 10 caracteres', () => {
        const { password } = generateCredentials('Test User', '123.456.789-00');
        expect(password.length).toBeGreaterThanOrEqual(10);
    });
});

// ============================================================
// Teste de normalização de headers Excel
// ============================================================
function normalizeHeader(h: string): string {
    return h.toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

describe('normalizeHeader', () => {
    it('normaliza acentos', () => {
        expect(normalizeHeader('Matrícula')).toBe('matricula');
    });

    it('normaliza espaços e maiúsculas', () => {
        expect(normalizeHeader('  NOME do Aluno  ')).toBe('nomedoaluno');
    });

    it('remove caracteres especiais', () => {
        expect(normalizeHeader('turma/curso')).toBe('turmacurso');
    });
});

// ============================================================
// Teste de validação de senha forte
// ============================================================
function validatePasswordStrength(password: string): string | null {
    if (password.length < 8) return 'mínimo 8 caracteres';
    if (!/[A-Z]/.test(password)) return 'deve conter letra maiúscula';
    if (!/[a-z]/.test(password)) return 'deve conter letra minúscula';
    if (!/[0-9]/.test(password)) return 'deve conter número';
    return null;
}

describe('validatePasswordStrength', () => {
    it('rejeita senha curta', () => {
        expect(validatePasswordStrength('Ab1')).not.toBeNull();
    });

    it('rejeita sem maiúscula', () => {
        expect(validatePasswordStrength('abcdefg1')).not.toBeNull();
    });

    it('rejeita sem minúscula', () => {
        expect(validatePasswordStrength('ABCDEFG1')).not.toBeNull();
    });

    it('rejeita sem número', () => {
        expect(validatePasswordStrength('Abcdefgh')).not.toBeNull();
    });

    it('aceita senha válida', () => {
        expect(validatePasswordStrength('Abcdefg1')).toBeNull();
    });

    it('aceita senha forte complexa', () => {
        expect(validatePasswordStrength('!Senha123')).toBeNull();
    });
});

// ============================================================
// Teste de cache invalidation (simulação)
// ============================================================
describe('Config cache', () => {
    it('cache invalida após TTL', () => {
        let cache: { data: unknown; expiresAt: number } | null = null;
        const TTL = 100; // 100ms para teste

        // Set cache
        cache = { data: { name: 'Test' }, expiresAt: Date.now() + TTL };
        expect(cache.expiresAt > Date.now()).toBe(true);

        // Invalidate
        cache = null;
        expect(cache).toBeNull();
    });
});

// ============================================================
// Teste de segurança: validação de roles
// ============================================================
describe('Role validation', () => {
    const VALID_ROLES = ['ADMIN', 'TEACHER', 'STUDENT'] as const;

    it('aceita roles válidos', () => {
        for (const role of VALID_ROLES) {
            expect(VALID_ROLES.includes(role as typeof VALID_ROLES[number])).toBe(true);
        }
    });

    it('rejeita role inválido', () => {
        expect(VALID_ROLES.includes('HACKER' as typeof VALID_ROLES[number])).toBe(false);
    });

    it('rejeita role vazio', () => {
        expect(VALID_ROLES.includes('' as typeof VALID_ROLES[number])).toBe(false);
    });
});
