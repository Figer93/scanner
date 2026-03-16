/**
 * API client: base URL and get/post/patch/delete helpers.
 * Uses fetch; returns parsed JSON; throws on non-ok with error body.
 * In dev we use relative URLs so Vite (e.g. localhost:5173) proxies /api to the backend.
 */
const BASE_URL = '';

async function request(method, path, body = undefined) {
    const url = path.startsWith('http') ? path : BASE_URL + path;
    const opts = { method, headers: {} };
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
    }
};

export default api;
