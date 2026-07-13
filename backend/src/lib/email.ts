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

export interface EmailConfigurationStatus {
    configured: boolean;
    missing: string[];
    host: string | null;
    port: number;
    secure: boolean;
    from: string | null;
}

export interface BulkEmailMessage {
    to: string;
    subject: string;
    message: string;
}

export interface BulkEmailResult {
    attempted: number;
    sent: number;
    failed: number;
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
    return getEmailConfigurationStatus().configured;
}

export function getEmailConfigurationStatus(): EmailConfigurationStatus {
    const cfg = getMailerConfig();
    const required = {
        SMTP_HOST: cfg.host,
        SMTP_PORT: Number.isFinite(cfg.port) && cfg.port > 0 ? String(cfg.port) : '',
        SMTP_USER: cfg.user,
        SMTP_PASS: cfg.pass,
        SMTP_FROM: cfg.from
    };
    const missing = Object.entries(required)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    return {
        configured: missing.length === 0,
        missing,
        host: cfg.host || null,
        port: cfg.port,
        secure: cfg.secure,
        from: cfg.from || null
    };
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
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: {
            user: cfg.user,
            pass: cfg.pass
        }
    });

    return cachedTransporter;
}

function getPlatformUrl(): string {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    return 'http://localhost:5173';
}

function baseTemplate(title: string, studentName: string, login: string, password: string, platformName: string) {
    const safeTitle = escapeHtml(title);
    const safeStudentName = escapeHtml(studentName);
    const safeLogin = escapeHtml(login);
    const safePassword = escapeHtml(password);
    const safePlatformName = escapeHtml(platformName);
    const platformUrl = getPlatformUrl();
    const safePlatformUrl = escapeHtml(platformUrl);
    return {
        text: `${title}\n\nOlá, ${studentName}!\n\nPlataforma: ${platformName}\nAcesse: ${platformUrl}\nLogin: ${login}\nSenha temporária: ${password}\n\nPor segurança, altere sua senha no primeiro acesso.`,
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
                <p><a href="${safePlatformUrl}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;">Acessar plataforma</a></p>
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

export async function sendBulkEmails(messages: BulkEmailMessage[], concurrency = 5): Promise<BulkEmailResult> {
    if (messages.length === 0) return { attempted: 0, sent: 0, failed: 0 };

    let nextIndex = 0;
    let sent = 0;
    let failed = 0;
    const workerCount = Math.min(Math.max(1, concurrency), messages.length);

    const worker = async () => {
        while (nextIndex < messages.length) {
            const message = messages[nextIndex++];
            try {
                await sendGenericEmail(message.to, message.subject, message.message);
                sent += 1;
            } catch {
                failed += 1;
            }
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return { attempted: messages.length, sent, failed };
}
