import nodemailer from 'nodemailer';

interface StudentCredentialEmailPayload {
    to: string;
    studentName: string;
    login: string;
    password: string;
    platformName?: string;
}

interface ResetPasswordEmailPayload {
    to: string;
    studentName: string;
    login: string;
    password: string;
    platformName?: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

function escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[char] as string);
}

function sanitizeHeader(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

function getMailerConfig() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    return {
        host,
        port,
        user,
        pass,
        from,
        secure: process.env.SMTP_SECURE === 'true'
    };
}

export function isEmailConfigured(): boolean {
    const cfg = getMailerConfig();
    return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
}

function getTransporter(): nodemailer.Transporter {
    if (cachedTransporter) return cachedTransporter;

    const cfg = getMailerConfig();
    if (!cfg.host || !cfg.user || !cfg.pass || !cfg.from) {
        throw new Error('SMTP não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.');
    }

    cachedTransporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: {
            user: cfg.user,
            pass: cfg.pass
        }
    });

    return cachedTransporter;
}

function baseTemplate(title: string, studentName: string, login: string, password: string, platformName: string) {
    const safeTitle = escapeHtml(title);
    const safeStudentName = escapeHtml(studentName);
    const safeLogin = escapeHtml(login);
    const safePassword = escapeHtml(password);
    const safePlatformName = escapeHtml(platformName);
    return {
        text: `${title}\n\nOlá, ${studentName}!\n\nAcesse: ${platformName}\nLogin: ${login}\nSenha temporária: ${password}\n\nPor segurança, altere sua senha no primeiro acesso.`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
                <h2 style="margin-bottom: 8px;">${safeTitle}</h2>
                <p>Olá, <strong>${safeStudentName}</strong>!</p>
                <p>Seus dados de acesso:</p>
                <ul>
                    <li><strong>Plataforma:</strong> ${safePlatformName}</li>
                    <li><strong>Login:</strong> ${safeLogin}</li>
                    <li><strong>Senha temporária:</strong> ${safePassword}</li>
                </ul>
                <p><strong>Importante:</strong> no primeiro acesso, troque sua senha.</p>
            </div>
        `
    };
}

export async function sendStudentCredentialsEmail(payload: StudentCredentialEmailPayload): Promise<void> {
    const transporter = getTransporter();
    const platformName = payload.platformName || process.env.PLATFORM_NAME || 'EduVault';
    const content = baseTemplate('Seu acesso foi criado', payload.studentName, payload.login, payload.password, platformName);

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: payload.to,
        subject: sanitizeHeader(`[${platformName}] Acesso criado`),
        text: content.text,
        html: content.html
    });
}

export async function sendResetPasswordEmail(payload: ResetPasswordEmailPayload): Promise<void> {
    const transporter = getTransporter();
    const platformName = payload.platformName || process.env.PLATFORM_NAME || 'EduVault';
    const content = baseTemplate('Sua senha foi redefinida', payload.studentName, payload.login, payload.password, platformName);

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: payload.to,
        subject: sanitizeHeader(`[${platformName}] Senha redefinida`),
        text: content.text,
        html: content.html
    });
}

export async function sendGenericEmail(to: string, subject: string, message: string): Promise<void> {
    const transporter = getTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: sanitizeHeader(subject),
        text: message,
        html: `<div style="font-family: Arial, sans-serif; white-space: pre-line; line-height: 1.6;">${escapeHtml(message)}</div>`
    });
}
