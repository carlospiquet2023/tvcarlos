const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function getYouTubeVideoId(reference) {
    if (typeof reference !== 'string' || !reference.trim()) return null;

    let url;
    try {
        url = new URL(reference.trim());
    } catch {
        return null;
    }

    if (url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();
    let candidate = '';

    if (host === 'youtu.be' || host === 'www.youtu.be') {
        candidate = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (YOUTUBE_HOSTS.has(host)) {
        const [route = '', routeId = ''] = url.pathname.split('/').filter(Boolean);
        candidate = route === 'watch'
            ? (url.searchParams.get('v') || '')
            : ['shorts', 'embed', 'live'].includes(route)
                ? routeId
                : '';
    } else if (YOUTUBE_EMBED_HOSTS.has(host)) {
        const [route = '', routeId = ''] = url.pathname.split('/').filter(Boolean);
        candidate = route === 'embed' ? routeId : '';
    }

    return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

export function buildYouTubeEmbedUrl(reference) {
    const videoId = getYouTubeVideoId(reference);
    if (!videoId) return null;

    const query = new URLSearchParams({
        autoplay: '0',
        controls: '0',
        disablekb: '1',
        enablejsapi: '1',
        fs: '0',
        playsinline: '1',
        rel: '0',
    });
    const origin = globalThis.location?.origin;
    if (origin && /^https?:\/\//.test(origin)) query.set('origin', origin);
    return `https://www.youtube-nocookie.com/embed/${videoId}?${query.toString()}`;
}
