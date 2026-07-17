import { describe, expect, it } from 'vitest';
import {
    attendanceDate,
    configuredAppTimezone,
    dateKeyInTimezone,
    detectMeetingProvider,
    normalizeStudentLiveClass,
} from '../modules/learning/liveClasses';

describe('learning live-class policy', () => {
    it('falls back from an invalid configured timezone', () => {
        expect(configuredAppTimezone('Not/A-Timezone')).toBe('America/Sao_Paulo');
    });

    it('creates stable date keys at timezone boundaries', () => {
        const instant = new Date('2026-07-13T01:00:00.000Z');
        expect(dateKeyInTimezone(instant, 'America/Sao_Paulo')).toBe('2026-07-12');
        expect(attendanceDate(instant, 'America/Sao_Paulo').toISOString()).toBe('2026-07-12T00:00:00.000Z');
    });

    it('detects providers and rejects unsafe meeting URLs', () => {
        expect(detectMeetingProvider('https://meet.google.com/example')).toBe('GOOGLE_MEET');
        expect(detectMeetingProvider('https://example.zoom.us/j/123')).toBe('ZOOM');
        const normalized = normalizeStudentLiveClass({ provider: 'CUSTOM', meetingJoinUrl: 'javascript:alert(1)' });
        expect(normalized.meetingJoinUrl).toBeNull();
        expect(normalized.provider).toBe('CUSTOM');
    });
});
