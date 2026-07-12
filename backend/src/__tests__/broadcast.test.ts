import { describe, expect, it, vi } from 'vitest';
import {
    authorizeRtmpPublication,
    parseNginxRtmpStatus,
    readBroadcastRuntimeStatus,
    serializePartner,
    serializeProgram,
    serializeSettings,
    serializeTicker,
} from '../routes/broadcast';

describe('broadcast security', () => {
    const environment = {
        RTMP_STREAM_KEY: 'stream-key-with-at-least-thirty-two-bytes',
        LOOP_STREAM_KEY: 'loop-key-with-at-least-thirty-two-bytes',
    };

    it('autoriza somente stream e loop com suas respectivas chaves', () => {
        expect(authorizeRtmpPublication({ name: 'stream', token: environment.RTMP_STREAM_KEY }, {}, environment).allowed).toBe(true);
        expect(authorizeRtmpPublication({ name: 'loop', args: `token=${environment.LOOP_STREAM_KEY}` }, {}, environment).allowed).toBe(true);
        expect(authorizeRtmpPublication({ name: `stream?token=${environment.RTMP_STREAM_KEY}` }, {}, environment).allowed).toBe(true);
        expect(authorizeRtmpPublication({ name: 'stream', token: 'errada' }, {}, environment).allowed).toBe(false);
        expect(authorizeRtmpPublication({ name: 'outro', token: environment.RTMP_STREAM_KEY }, {}, environment).allowed).toBe(false);
    });

    it('consulta sessoes RTMP publicadas sem confiar em playlists HLS residuais', async () => {
        const statusXml = `<?xml version="1.0" encoding="utf-8" ?>
            <rtmp><server><application><name>live</name><live>
                <stream><name>stream</name><publishing/><active>1200</active></stream>
                <stream><name>loop</name><active>900</active></stream>
            </live></application></server></rtmp>`;
        const fetchMock = vi.fn().mockResolvedValue(new Response(statusXml, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        }));

        await expect(readBroadcastRuntimeStatus(
            { BROADCAST_INTERNAL_URL: 'http://broadcast:8080/' },
            fetchMock as unknown as typeof fetch,
        )).resolves.toMatchObject({ live: true, loop: false, available: true, source: 'nginx-rtmp-stat' });
        expect(fetchMock).toHaveBeenCalledWith('http://broadcast:8080/stat', expect.objectContaining({
            headers: { Accept: 'application/xml' },
        }));

        await expect(readBroadcastRuntimeStatus({}, fetchMock as unknown as typeof fetch))
            .resolves.toMatchObject({ live: false, loop: false, available: false, source: 'not-configured' });
    });

    it('falha fechado para XML invalido, grande ou streams de outro aplicativo', () => {
        expect(parseNginxRtmpStatus('<html>erro</html>')).toEqual({ valid: false, live: false, loop: false });
        expect(parseNginxRtmpStatus('x'.repeat(512 * 1024 + 1))).toEqual({ valid: false, live: false, loop: false });
        expect(parseNginxRtmpStatus(
            '<rtmp><server><application><name>other</name><live><stream><name>stream</name><publishing/></stream></live></application></server></rtmp>',
        )).toEqual({ valid: true, live: false, loop: false });
    });

    it('serializa o contrato consolidado esperado pelo frontend', () => {
        expect(serializeSettings({
            title: 'Default antigo',
            description: 'Descricao antiga',
            companyName: 'Campus',
            tagline: 'Educacao ao vivo',
            liveSource: 'OBS',
            liveUrl: 'javascript:alert(1)',
            backgroundUrl: '/uploads/images/campus.webp',
            accentColor: '#00c4b5',
        })).toMatchObject({
            title: 'Campus',
            description: 'Educacao ao vivo',
            liveUrl: '/broadcast/hls/stream.m3u8',
            loopUrl: '/broadcast/hls/loop.m3u8',
            posterUrl: '/uploads/images/campus.webp',
        });

        expect(serializeProgram({
            sourceUrl: '/videos/aula.mp4',
            description: 'Aula',
            startsAt: new Date('2026-07-10T12:00:00Z'),
            endsAt: null,
            published: false,
            position: 7,
        })).toMatchObject({
            video: '/videos/aula.mp4',
            desc: 'Aula',
            startAt: new Date('2026-07-10T12:00:00Z'),
            endAt: null,
            active: false,
            order: 7,
        });
        expect(serializeTicker({ position: 4, active: false })).toMatchObject({ order: 4, active: false });
        expect(serializePartner({ destinationUrl: 'https://example.com', position: 2, active: true }))
            .toMatchObject({ url: 'https://example.com', order: 2, active: true });
    });
});
