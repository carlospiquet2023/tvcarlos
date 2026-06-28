export const ENDPOINTS = Object.freeze({
    news: '/api/news', programs: '/api/grade', branding: '/api/branding',
    partners: '/api/partners', headerLinks: '/api/header-links',
    privateRooms: '/api/private-rooms', audit: '/api/audit?limit=30',
});

export const adminState = {
    news: [], programs: [], partners: [], headerLinks: [], privateRooms: [], branding: null, session: null,
    editing: { news: null, programs: null, partners: null, headerLinks: null, privateRooms: null },
};

export function jsonRequest(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
