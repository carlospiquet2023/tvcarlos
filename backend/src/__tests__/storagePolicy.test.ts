import { describe, expect, it } from 'vitest';
import { canUsePublicObjectStorage } from '../lib/storage';

describe('storage publication policy', () => {
    it('never publishes protected course PDFs on a public bucket URL', () => {
        expect(canUsePublicObjectStorage('pdfs')).toBe(false);
    });

    it('allows assets that already have public application routes', () => {
        expect(canUsePublicObjectStorage('images')).toBe(true);
        expect(canUsePublicObjectStorage('videos/broadcast')).toBe(true);
    });
});
