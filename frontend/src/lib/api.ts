import axios from 'axios';
import { API_BASE_URL } from './urls';

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    withXSRFToken: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    timeout: 10 * 60 * 1000
});

api.interceptors.response.use(
    response => response,
    error => {
        const status = error?.response?.status;
        const message = String(error?.response?.data?.message || '');
        const isSessionFailure = status === 401
            || (status === 403 && /token|sess[aã]o|expirad|revogad|bloquead/i.test(message));
        if (isSessionFailure && !String(error?.config?.url || '').includes('/api/auth/login')) {
            window.dispatchEvent(new Event('eduvault:session-expired'));
        }
        return Promise.reject(error);
    }
);

export default api;
