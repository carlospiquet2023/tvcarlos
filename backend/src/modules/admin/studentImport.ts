import bcrypt from 'bcrypt';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { isEmailConfigured, sendBulkEmails } from '../../lib/email';

const MAX_IMPORT_ROWS = 5_000;

export interface StudentImportRowResult {
    name: string;
    email: string;
    password: string;
    enrolled: string[];
    error?: string;
}

export interface StudentImportResult {
    results: StudentImportRowResult[];
    emailDelivery: {
        configured: boolean;
        eligible: number;
        attempted: number;
        sent: number;
        failed: number;
    };
}

export class StudentImportInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StudentImportInputError';
    }
}

export function normalizeImportHeader(header: string): string {
    return header.toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

export function generateStudentCredentials(name: string, cpf: string): { email: string; password: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = (parts[0] || 'aluno').toLowerCase().replace(/[^a-z]/g, '');
    const second = (parts[1] || '').toLowerCase().replace(/[^a-z]/g, '');
    const email = `${first}${second}@alunos.com`;
    const cpfDigits = cpf.replace(/\D/g, '');
    const last4 = cpfDigits.slice(-4) || '0000';
    const randomPrefix = crypto.randomBytes(3).toString('hex').slice(0, 4);
    const randomSuffix = crypto.randomBytes(2).toString('base64url').slice(0, 2);
    return { email, password: `${randomPrefix}${last4}${randomSuffix}` };
}

export function isValidEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function isDeliverableEmailAddress(value: string): boolean {
    return isValidEmailAddress(value) && !value.toLowerCase().endsWith('@alunos.com');
}

function cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if ('text' in value && typeof value.text === 'string') return value.text.trim();
        if ('result' in value && value.result !== undefined) return String(value.result).trim();
        if ('richText' in value && Array.isArray(value.richText)) {
            return value.richText.map((part) => part.text).join('').trim();
        }
    }
    return String(value).trim();
}

async function readRows(filePath: string): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new StudentImportInputError('A planilha não possui abas.');
    if (sheet.actualRowCount > MAX_IMPORT_ROWS + 1) {
        throw new StudentImportInputError(`A planilha excede o limite de ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')} alunos por importação.`);
    }

    const headers: string[] = [];
    const headerRow = sheet.getRow(1);
    for (let column = 1; column <= headerRow.cellCount; column += 1) {
        headers.push(cellText(headerRow.getCell(column).value));
    }

    const rows: Record<string, string>[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
            if (header) record[header] = row.getCell(index + 1).text.trim();
        });
        if (Object.values(record).some(Boolean)) rows.push(record);
    }
    if (!rows.length) throw new StudentImportInputError('Planilha vazia.');
    return rows;
}

function resolveHeaders(rows: Record<string, string>[]): Record<'student' | 'cpf' | 'class' | 'email', string> {
    const headerMap = { student: '', cpf: '', class: '', email: '' };
    for (const header of Object.keys(rows[0])) {
        const normalized = normalizeImportHeader(header);
        if (normalized.includes('aluno') || normalized.includes('nome')) headerMap.student = header;
        else if (normalized.includes('turma') || normalized.includes('curso')) headerMap.class = header;
        else if (normalized.includes('cpf')) headerMap.cpf = header;
        else if (normalized.includes('email')) headerMap.email = header;
    }
    if (!headerMap.student || !headerMap.cpf) {
        throw new StudentImportInputError('Cabeçalhos obrigatórios: aluno (ou nome) e cpf.');
    }
    return headerMap;
}

export async function importStudentsFromWorkbook(filePath: string): Promise<StudentImportResult> {
    const rows = await readRows(filePath);
    const headers = resolveHeaders(rows);
    const allCourses = await prisma.course.findMany({ select: { id: true, name: true } });
    const courseByName = new Map(allCourses.map((course) => [course.name.trim().toLowerCase(), course]));

    const candidateEmails = rows.map((row) => {
        const name = (row[headers.student] || '').trim();
        const cpf = (row[headers.cpf] || '').trim();
        if (!name || !cpf) return null;
        const supplied = headers.email ? (row[headers.email] || '').trim().toLowerCase() : '';
        if (supplied && !isValidEmailAddress(supplied)) return null;
        return supplied || generateStudentCredentials(name, cpf).email;
    }).filter((email): email is string => Boolean(email));

    const existingUsers = await prisma.user.findMany({
        where: { email: { in: candidateEmails } },
        select: { id: true, email: true },
    });
    const userByEmail = new Map(existingUsers.map((user) => [user.email, user]));
    const credentials = new Map<string, {
        name: string;
        password: string;
        className: string;
        isNew: boolean;
        deliverable: boolean;
    }>();
    const results: StudentImportRowResult[] = [];
    const usersToCreate: Array<{ name: string; email: string; username: string; password: string; role: 'STUDENT' }> = [];

    for (const row of rows) {
        const name = (row[headers.student] || '').trim();
        const cpf = (row[headers.cpf] || '').trim();
        const className = headers.class ? (row[headers.class] || '').trim() : '';
        const suppliedEmail = headers.email ? (row[headers.email] || '').trim().toLowerCase() : '';
        if (!name || !cpf) {
            results.push({ name: name || '(vazio)', email: '', password: '', enrolled: [], error: 'Nome ou CPF em branco' });
            continue;
        }
        if (suppliedEmail && !isValidEmailAddress(suppliedEmail)) {
            results.push({ name, email: suppliedEmail, password: '', enrolled: [], error: 'E-mail inválido' });
            continue;
        }

        const generated = generateStudentCredentials(name, cpf);
        const email = suppliedEmail || generated.email;
        if (credentials.has(email)) {
            results.push({ name, email, password: '', enrolled: [], error: 'E-mail duplicado na planilha' });
            continue;
        }
        const isNew = !userByEmail.has(email);
        const password = isNew ? generated.password : '';
        credentials.set(email, { name, password, className, isNew, deliverable: Boolean(suppliedEmail) });
        if (isNew) {
            usersToCreate.push({ name, email, username: email, password: await bcrypt.hash(password, 12), role: 'STUDENT' });
        }
    }

    await prisma.$transaction(async (tx) => {
        if (usersToCreate.length) {
            await tx.user.createMany({ data: usersToCreate, skipDuplicates: true });
            const savedUsers = await tx.user.findMany({
                where: { email: { in: usersToCreate.map((user) => user.email) } },
                select: { id: true, email: true },
            });
            for (const user of savedUsers) userByEmail.set(user.email, user);
        }

        const userIds = [...userByEmail.values()].map((user) => user.id);
        const existingEnrollments = await tx.courseEnrollment.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, courseId: true },
        });
        const enrollmentKeys = new Set(existingEnrollments.map((item) => `${item.userId}_${item.courseId}`));
        const enrollmentsToCreate: Array<{ userId: string; courseId: string }> = [];

        for (const [email, values] of credentials) {
            const user = userByEmail.get(email);
            if (!user) {
                results.push({ name: values.name, email, password: values.password, enrolled: [], error: 'Falha ao criar usuário' });
                continue;
            }
            const enrolled: string[] = [];
            const course = values.className ? courseByName.get(values.className.trim().toLowerCase()) : undefined;
            if (course) {
                const key = `${user.id}_${course.id}`;
                if (!enrollmentKeys.has(key)) {
                    enrollmentsToCreate.push({ userId: user.id, courseId: course.id });
                    enrollmentKeys.add(key);
                }
                enrolled.push(course.name);
            }
            results.push({ name: values.name, email, password: values.password, enrolled });
        }
        if (enrollmentsToCreate.length) {
            await tx.courseEnrollment.createMany({ data: enrollmentsToCreate, skipDuplicates: true });
        }
    });

    const messages = [...credentials.entries()]
        .filter(([, value]) => value.isNew && value.deliverable)
        .map(([email, value]) => ({
            to: email,
            subject: `[${process.env.PLATFORM_NAME || 'EduVault'}] Acesso criado`,
            message: `Olá, ${value.name}!\n\nSeu acesso foi criado.\nLogin: ${email}\nSenha temporária: ${value.password}\n\nPor segurança, altere sua senha no primeiro acesso.`,
        }));
    const configured = isEmailConfigured();
    const emailResult = configured
        ? await sendBulkEmails(messages)
        : { attempted: 0, sent: 0, failed: 0 };
    if (emailResult.failed > 0) logger.warn({ ...emailResult }, 'Parte dos e-mails da importação não foi entregue');

    return {
        results,
        emailDelivery: { configured, eligible: messages.length, ...emailResult },
    };
}
