export const API_BASE_URL = import.meta.env.VITE_API_URL?.trim() || '';

const ABSOLUTE_URL_PATTERN = /^(?:https?:|blob:|data:)/i;

/**
 * Resolves an API or media path without rewriting already absolute browser URLs.
 * Relative resources are always normalized to a root-relative path before the
 * configured API origin is applied.
 */
export function resolveApiUrl(value: string | null | undefined): string {
    if (!value) return '';
    if (ABSOLUTE_URL_PATTERN.test(value)) return value;
    return `${API_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

export const resolveMediaUrl = resolveApiUrl;
