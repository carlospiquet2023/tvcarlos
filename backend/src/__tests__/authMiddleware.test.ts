import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    logError: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    default: { user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } },
}));

vi.mock('../lib/logger', () => ({
    default: { error: mocks.logError },
}));

import {
    authenticateStreamToken,
    authenticateToken,
    revokeSessionToken,
} from '../middleware/authMiddleware';
import { logoutHandler } from '../routes/auth';

const SECRET = 'unit-test-secret-that-is-long-enough-for-hmac';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_VIDEO_ID = '33333333-3333-4333-8333-333333333333';

function responseDouble() {
    const response = {
        cookie: vi.fn(),
        clearCookie: vi.fn(),
        setHeader: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
        send: vi.fn(),
    };
    response.status.mockReturnValue(response);
    return response as unknown as Response & typeof response;
}

function sessionRequest(token: string): Request {
    return { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
}

function streamRequest(token: string, path: string): Request {
    return { headers: { authorization: `bearer\t${token}` }, path } as unknown as Request;
}

function sessionToken(algorithm: 'HS256' | 'HS512' = 'HS256'): string {
    return jwt.sign({
        id: USER_ID,
        email: 'old@example.test',
        role: 'STUDENT',
        name: 'Old Name',
        ver: 4,
    }, SECRET, { algorithm, expiresIn: '5m' });
}

function streamToken(algorithm: 'HS256' | 'HS512' = 'HS256'): string {
    return jwt.sign({
        id: USER_ID,
        role: 'STUDENT',
        ver: 4,
        purpose: 'stream',
        videoId: VIDEO_ID,
    }, SECRET, { algorithm, expiresIn: '5m' });
}

beforeEach(() => {
    vi.stubEnv('JWT_SECRET', SECRET);
    mocks.findUnique.mockReset();
    mocks.updateMany.mockReset();
    mocks.logError.mockReset();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('authenticateToken', () => {
    it('uses canonical current user data after validating tokenVersion', async () => {
        mocks.findUnique.mockResolvedValue({
            id: USER_ID,
            username: 'current-user',
            email: 'current@example.test',
            role: 'TEACHER',
            name: 'Current Name',
            tokenVersion: 4,
            mustChangePassword: false,
        });
        const req = sessionRequest(sessionToken());
        const res = responseDouble();
        const next = vi.fn() as NextFunction;

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.user).toEqual(expect.objectContaining({
            id: USER_ID,
            email: 'current@example.test',
            role: 'TEACHER',
            name: 'Current Name',
            ver: 4,
        }));
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    });

    it('returns 503 instead of revoking the browser session on a database outage', async () => {
        mocks.findUnique.mockRejectedValue(new Error('database unavailable'));
        const res = responseDouble();
        const next = vi.fn() as NextFunction;

        await authenticateToken(sessionRequest(sessionToken()), res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
        expect(mocks.logError).toHaveBeenCalledOnce();
    });

    it('blocks an account before protected content is served', async () => {
        mocks.findUnique.mockResolvedValue({
            id: USER_ID,
            username: 'blocked-student',
            email: 'blocked@example.test',
            role: 'STUDENT',
            name: 'Blocked Student',
            tokenVersion: 4,
            mustChangePassword: false,
            accessBlocked: true,
        });
        const req = sessionRequest(sessionToken());
        const res = responseDouble();
        const next = vi.fn() as NextFunction;

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('bloqueado') }));
        expect(res.clearCookie).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects revoked sessions as authentication failures', async () => {
        mocks.findUnique.mockResolvedValue({
            id: USER_ID,
            username: null,
            email: 'student@example.test',
            role: 'STUDENT',
            name: 'Student',
            tokenVersion: 5,
            mustChangePassword: false,
        });
        const res = responseDouble();

        await authenticateToken(sessionRequest(sessionToken()), res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('accepts only the HS256 algorithm used by the issuer', async () => {
        const res = responseDouble();
        await authenticateToken(sessionRequest(sessionToken('HS512')), res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mocks.findUnique).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    });

    it('rejects a signed session without an expiration claim', async () => {
        const token = jwt.sign({
            id: USER_ID,
            role: 'STUDENT',
            ver: 4,
        }, SECRET, { algorithm: 'HS256' });
        const res = responseDouble();
        await authenticateToken(sessionRequest(token), res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it('enforces temporary-password rotation on the server while allowing /me and /profile', async () => {
        mocks.findUnique.mockResolvedValue({
            id: USER_ID,
            username: 'student',
            email: 'student@example.test',
            role: 'STUDENT',
            name: 'Student',
            tokenVersion: 4,
            mustChangePassword: true,
        });

        const protectedRequest = sessionRequest(sessionToken());
        Object.assign(protectedRequest, { baseUrl: '/api/student', path: '/my-courses' });
        const protectedResponse = responseDouble();
        await authenticateToken(protectedRequest, protectedResponse, vi.fn());
        expect(protectedResponse.status).toHaveBeenCalledWith(428);

        for (const path of ['/me', '/profile']) {
            const allowedRequest = sessionRequest(sessionToken());
            Object.assign(allowedRequest, { baseUrl: '/api/auth', path });
            const allowedNext = vi.fn() as NextFunction;
            await authenticateToken(allowedRequest, responseDouble(), allowedNext);
            expect(allowedNext, path).toHaveBeenCalledOnce();
        }
    });
});

describe('session revocation and logout', () => {
    it('increments tokenVersion atomically for the exact active session version', async () => {
        mocks.updateMany.mockResolvedValue({ count: 1 });
        await expect(revokeSessionToken(sessionToken())).resolves.toBe(true);
        expect(mocks.updateMany).toHaveBeenCalledWith({
            where: { id: USER_ID, tokenVersion: 4 },
            data: { tokenVersion: { increment: 1 } },
        });
    });

    it('is idempotent for an invalid, expired, or previously revoked token', async () => {
        await expect(revokeSessionToken('not-a-jwt')).resolves.toBe(false);
        expect(mocks.updateMany).not.toHaveBeenCalled();

        mocks.updateMany.mockResolvedValue({ count: 0 });
        await expect(revokeSessionToken(sessionToken())).resolves.toBe(false);
    });

    it('always clears browser cookies after a successful logout', async () => {
        mocks.updateMany.mockResolvedValue({ count: 1 });
        const res = responseDouble();
        await logoutHandler(sessionRequest(sessionToken()), res);

        expect(mocks.updateMany).toHaveBeenCalledOnce();
        expect(res.clearCookie).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalledOnce();
    });

    it('clears browser cookies and reports a transient failure when DB revocation fails', async () => {
        mocks.updateMany.mockRejectedValue(new Error('database unavailable'));
        const res = responseDouble();
        await logoutHandler(sessionRequest(sessionToken()), res);

        expect(res.clearCookie).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Sessão local encerrada'),
        }));
    });

    it('lets a temporary-password account log out without passing the content gate', async () => {
        mocks.updateMany.mockResolvedValue({ count: 1 });
        const res = responseDouble();
        await logoutHandler(sessionRequest(sessionToken()), res);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(mocks.findUnique).not.toHaveBeenCalled();
    });
});

describe('authenticateStreamToken', () => {
    it('authorizes generated files inside the video directory', () => {
        const req = streamRequest(streamToken(), `/${VIDEO_ID}/v0/prog_index.m3u8`);
        const res = responseDouble();
        const next = vi.fn() as NextFunction;

        authenticateStreamToken(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.user).toEqual(expect.objectContaining({ purpose: 'stream', videoId: VIDEO_ID }));
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('does not let a video-scoped token cross into a sibling HLS directory', () => {
        for (const path of [
            `/${OTHER_VIDEO_ID}/master.m3u8`,
            `/${VIDEO_ID}/../${OTHER_VIDEO_ID}/master.m3u8`,
            `/${VIDEO_ID}/%2e%2e/${OTHER_VIDEO_ID}/master.m3u8`,
            `/${VIDEO_ID}\\..\\${OTHER_VIDEO_ID}\\master.m3u8`,
        ]) {
            const res = responseDouble();
            const next = vi.fn() as NextFunction;
            authenticateStreamToken(streamRequest(streamToken(), path), res, next);
            expect(next, path).not.toHaveBeenCalled();
            expect(res.status, path).toHaveBeenCalledWith(403);
        }
    });

    it('rejects a correctly signed stream token that uses another HMAC algorithm', () => {
        const res = responseDouble();
        authenticateStreamToken(
            streamRequest(streamToken('HS512'), `/${VIDEO_ID}/master.m3u8`),
            res,
            vi.fn(),
        );
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
