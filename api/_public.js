/**
 * Chiamata anonima alle azioni pubbliche della Function `api` di Appwrite
 * (profili pubblici, sitemap). Usa solo endpoint e id del progetto, già pubblici
 * nel frontend: nessuna chiave segreta su Vercel.
 */
export async function callPublic(action, params = {}) {
    const endpoint = (process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
    const project = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
    if (!endpoint || !project) throw new Error('Configurazione Appwrite mancante');
    const res = await fetch(`${endpoint}/functions/api/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project },
        body: JSON.stringify({ body: JSON.stringify({ action, ...params }), async: false, path: '/', method: 'POST', headers: { 'content-type': 'application/json' } }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Appwrite ${res.status}`);
    const execution = await res.json();
    const payload = JSON.parse(execution.responseBody || '{}');
    if (!payload.ok) {
        const err = new Error(payload.error || 'Errore');
        err.status = execution.responseStatusCode;
        throw err;
    }
    return payload.data;
}

export const originOf = (req) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
};

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Sostituisce (o aggiunge) un meta tag nell'index.html dell'app. */
export const setMeta = (html, attr, key, value) => {
    const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
    const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'i');
    return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
};

/** JSON dentro <script>: niente chiusure di tag iniettate. */
export const safeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
