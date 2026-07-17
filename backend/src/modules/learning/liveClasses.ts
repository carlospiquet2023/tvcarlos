import prisma from '../../lib/prisma';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function configuredAppTimezone(value = process.env.APP_TIMEZONE): string {
    const configured = value?.trim() || DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: configured }).format(new Date());
        return configured;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function dateKeyInTimezone(date = new Date(), timezone = configuredAppTimezone()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function attendanceDate(date = new Date(), timezone = configuredAppTimezone()): Date {
    return new Date(`${dateKeyInTimezone(date, timezone)}T00:00:00.000Z`);
}

export function detectMeetingProvider(url?: string | null): string {
    if (!url) return 'CUSTOM';
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('meet.google')) return 'GOOGLE_MEET';
        if (host.includes('teams.microsoft')) return 'MICROSOFT_TEAMS';
        if (host.includes('zoom.us')) return 'ZOOM';
        if (host.includes('jitsi')) return 'JITSI';
        if (host.includes('whereby')) return 'WHEREBY';
        if (host.includes('bigbluebutton') || host.includes('bbb')) return 'BIGBLUEBUTTON';
        return 'CUSTOM';
    } catch {
        return 'CUSTOM';
    }
}

export function normalizeStudentLiveClass<T extends {
    provider?: string | null;
    meetingJoinUrl?: string | null;
    zoomJoinUrl?: string | null;
}>(liveClass: T): T & { provider: string; meetingJoinUrl: string | null; zoomJoinUrl: string | null } {
    const candidate = liveClass.meetingJoinUrl || liveClass.zoomJoinUrl || null;
    let safeJoinUrl: string | null = null;
    if (candidate) {
        try {
            const parsed = new URL(candidate);
            const developmentHttp = process.env.NODE_ENV !== 'production'
                && parsed.protocol === 'http:'
                && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
            if ((parsed.protocol === 'https:' || developmentHttp) && !parsed.username && !parsed.password) {
                safeJoinUrl = parsed.toString();
            }
        } catch {
            safeJoinUrl = null;
        }
    }
    return {
        ...liveClass,
        provider: liveClass.provider && liveClass.provider !== 'CUSTOM'
            ? liveClass.provider
            : detectMeetingProvider(safeJoinUrl),
        meetingJoinUrl: safeJoinUrl,
        zoomJoinUrl: safeJoinUrl,
    };
}

export async function hasScheduledClassOnLocalDate(moduleId: string, date: Date): Promise<boolean> {
    const timezone = configuredAppTimezone();
    const key = dateKeyInTimezone(date, timezone);
    const [year, month, day] = key.split('-').map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const candidates = await prisma.liveClass.findMany({
        where: {
            moduleId,
            startAt: {
                gte: new Date(utcMidnight - 14 * 60 * 60 * 1000),
                lt: new Date(utcMidnight + 38 * 60 * 60 * 1000),
            },
        },
        select: { startAt: true },
        take: 50,
    });
    return candidates.some((liveClass) => dateKeyInTimezone(liveClass.startAt, timezone) === key);
}
