// ============================================
// api.js — Frontend API Helper
// All pages use this to talk to the backend
// ============================================

const API = {
  base: '', // Empty = same origin (your backend serves the frontend)

  async request(method, endpoint, body = null) {
    const token = localStorage.getItem('fg_token');
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body)  opts.body = JSON.stringify(body);

    const res  = await fetch(this.base + endpoint, opts);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get:  (url)       => API.request('GET',  url),
  post: (url, body) => API.request('POST', url, body),
  put:  (url, body) => API.request('PUT',  url, body),
  del:  (url)       => API.request('DELETE', url)
};