import { describe, expect, it } from 'vitest';
import {
    hashRoomPassword,
    matchesRoomPassword,
    validRoomPassword,
    validSlug,
    validVideoUrl,
} from '../routes/privateRooms';

describe('private room security', () => {
    it('hashes secrets and verifies only the correct candidate', async () => {
        const secret = 'Turma-Elite-2026!';
        const hash = await hashRoomPassword(secret);

        expect(hash).not.toBe(secret);
        expect(hash.startsWith('$2')).toBe(true);
        await expect(matchesRoomPassword(hash, secret)).resolves.toBe(true);
        await expect(matchesRoomPassword(hash, 'senha-incorreta')).resolves.toBe(false);
    });

    it('rejects weak room passwords', () => {
        expect(() => validRoomPassword('curta')).toThrow();
        expect(validRoomPassword('Segredo-forte-2026')).toBe('Segredo-forte-2026');
    });

    it('accepts canonical slugs and rejects path manipulation', () => {
        expect(validSlug('Aula-Magna-2026')).toBe('aula-magna-2026');
        expect(() => validSlug('../admin')).toThrow();
        expect(() => validSlug('aula com espaço')).toThrow();
    });

    it('allows HTTPS or internal media paths and blocks unsafe schemes', () => {
        expect(validVideoUrl('https://media.example.edu/aula.m3u8')).toContain('https://');
        expect(validVideoUrl('/hls/video/index.m3u8')).toContain('/hls/');
        expect(() => validVideoUrl('javascript:alert(1)')).toThrow();
        expect(() => validVideoUrl('http://inseguro.example/aula.mp4')).toThrow();
    });
});
