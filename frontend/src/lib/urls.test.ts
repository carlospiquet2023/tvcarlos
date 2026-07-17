import { describe, expect, it } from 'vitest';
import { resolveApiUrl, resolveMediaUrl } from './urls';

describe('resolveApiUrl', () => {
    it('keeps supported absolute browser URLs unchanged', () => {
        expect(resolveApiUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
        expect(resolveApiUrl('blob:https://app.example.com/id')).toBe('blob:https://app.example.com/id');
        expect(resolveApiUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    });

    it('normalizes relative API resources to root-relative URLs', () => {
        expect(resolveApiUrl('/uploads/images/logo.png')).toBe('/uploads/images/logo.png');
        expect(resolveApiUrl('uploads/images/logo.png')).toBe('/uploads/images/logo.png');
    });

    it('uses an empty string for absent resources', () => {
        expect(resolveApiUrl(null)).toBe('');
        expect(resolveMediaUrl(undefined)).toBe('');
    });
});
