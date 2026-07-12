import path from 'path';

const SAFE_PDF_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}\.pdf$/i;

/**
 * Converts the path seen by middleware mounted at /uploads/pdfs into the
 * canonical value persisted in Module.pdfUrl/Course.calendarUrl.
 *
 * Express normally rejects traversal before static serving, but doing the
 * validation here keeps authorization lookups and filesystem resolution on
 * exactly the same, single-file namespace.
 */
export function publicPdfPathFromMountedRequest(requestPath: string): string | null {
    if (!requestPath || requestPath.includes('\\') || requestPath.includes('\0')) return null;

    let decoded: string;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        return null;
    }

    const segments = decoded.split('/').filter(Boolean);
    if (segments.length !== 1 || !SAFE_PDF_FILENAME.test(segments[0])) return null;
    return `/uploads/pdfs/${segments[0]}`;
}

/** Returns true only when candidate resolves to a descendant of root. */
export function isPathInside(root: string, candidate: string): boolean {
    const absoluteRoot = path.resolve(root);
    const absoluteCandidate = path.resolve(candidate);
    const relative = path.relative(absoluteRoot, absoluteCandidate);
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
