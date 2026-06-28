export const ENDPOINTS = Object.freeze({
    news: '/api/news', programs: '/api/grade', branding: '/api/branding',
    partners: '/api/partners', headerLinks: '/api/header-links',
    privateRooms: '/api/private-rooms', privateRoomMessages: '/api/private-room-messages', audit: '/api/audit?limit=30',
    teachers: '/api/teachers',
});

export const adminState = {
    news: [], programs: [], partners: [], headerLinks: [], privateRooms: [], teachers: [], branding: null, session: null,
    privateRoomInteraction: { selectedRoomId: null, settings: null, messages: [], filter: 'pending' },
    editing: { news: null, programs: null, partners: null, headerLinks: null, privateRooms: null, teachers: null },
};

export function jsonRequest(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
