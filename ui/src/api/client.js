/**
 * API client: base URL and get/post/patch/delete helpers.
 * Uses fetch; returns parsed JSON; throws on non-ok with error body.
 * When ADMIN_TOKEN is configured, store the same value after login as Bearer token.
 */
const BASE_URL = '';

const TOKEN_KEY = 'foundlystart_admin_token';

export function getAdminToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
        return '';
    }
}

export function setAdminToken(token) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

export function clearAdminToken() {
    try {
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

async function request(method, path, body = undefined) {
    const url = path.startsWith('http') ? path : BASE_URL + path;
    const opts = { method, headers: {} };
    const token = getAdminToken();
    if (token) {
        opts.headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined && body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    if (res.status === 401 && token && !path.includes('/api/auth/login')) {
        clearAdminToken();
        if (typeof window !== 'undefined') window.location.reload();
    }
    if (!res.ok) {
        const err = new Error(data?.error || res.statusText || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    get(path) {
        return request('GET', path);
    },
    post(path, body) {
        return request('POST', path, body);
    },
    patch(path, body) {
        return request('PATCH', path, body);
    },
    delete(path) {
        return request('DELETE', path);
    },
};

export default api;
