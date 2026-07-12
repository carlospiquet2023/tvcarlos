import path from 'path';
import { describe, expect, it } from 'vitest';
import { isPathInside, publicPdfPathFromMountedRequest } from '../lib/mediaPaths';

describe('publicPdfPathFromMountedRequest', () => {
    it('accepts a single generated PDF filename', () => {
        expect(publicPdfPathFromMountedRequest('/8b34e944-45e7-42a8-a75e-390afe3b4ed0.pdf'))
            .toBe('/uploads/pdfs/8b34e944-45e7-42a8-a75e-390afe3b4ed0.pdf');
    });

    it.each([
        '/../secret.pdf',
        '/%2e%2e%2fsecret.pdf',
        '/folder/material.pdf',
        '/material.pdf/extra',
        '/material.html',
        '/bad%ZZ.pdf',
        '/bad\\name.pdf',
    ])('rejects unsafe PDF path %s', (value) => {
        expect(publicPdfPathFromMountedRequest(value)).toBeNull();
    });
});

describe('isPathInside', () => {
    const root = path.resolve('uploads/videos');

    it('accepts a file below the configured root', () => {
        expect(isPathInside(root, path.join(root, 'video-id.mp4'))).toBe(true);
    });

    it('rejects the root itself and traversal outside it', () => {
        expect(isPathInside(root, root)).toBe(false);
        expect(isPathInside(root, path.resolve(root, '..', 'secret.txt'))).toBe(false);
    });
});
