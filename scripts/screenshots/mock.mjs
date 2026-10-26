/**
 * Appwrite finto per le schermate e i test end-to-end: intercetta le richieste del browser
 * e risponde con i dati di esempio di fixtures.mjs. `state` tiene sessione e chiamate fatte.
 */
import { account, accountLogs, apiResponses, collections, sessions } from './fixtures.mjs';

const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Applica i filtri più comuni delle query Appwrite (formato JSON). */
export function applyQueries(rows, rawQueries) {
    let out = rows;
    for (const raw of rawQueries) {
        let q;
        try { q = JSON.parse(raw); } catch { continue; }
        if (q.method === 'equal' && q.attribute && !q.attribute.startsWith('$')) {
            out = out.filter((r) => q.values.includes(r[q.attribute]));
        }
        if (q.method === 'equal' && q.attribute === '$id') out = out.filter((r) => q.values.includes(r.$id));
        if (q.method === 'isNull' && q.attribute) out = out.filter((r) => r[q.attribute] == null);
        if (q.method === 'notEqual' && q.attribute) out = out.filter((r) => !q.values.includes(r[q.attribute]));
        if (q.method === 'contains' && q.attribute) {
            out = out.filter((r) => {
                const v = r[q.attribute];
                return Array.isArray(v) ? v.some((x) => q.values.includes(x)) : typeof v === 'string' && q.values.some((x) => v.toLowerCase().includes(String(x).toLowerCase()));
            });
        }
        if (q.method === 'limit') out = out.slice(0, q.values[0]);
    }
    return out;
}

/** Righe di una collezione con le modifiche di `state.overrides[collezione][id]` (es. un profilo Premium). */
const withOverrides = (collection, state) => {
    const rows = collections[collection] || [];
    const patch = state.overrides?.[collection];
    return patch ? rows.map((r) => (patch[r.$id] ? { ...r, ...patch[r.$id] } : r)) : rows;
};

/**
 * state: { loggedIn: boolean, mfaRequired?: boolean, calls?: {action, params}[], responses?: {[action]: fn} }
 * Con `loggedIn: false` il login (POST /account/sessions/email) apre la sessione;
 * con `mfaRequired` serve anche la sfida della verifica in due passaggi.
 */
export async function mockAppwrite(page, state) {
    state.calls ??= [];
    state.accountCalls ??= [];
    await page.route(/\/v1\/realtime/, (route) => route.abort());
    // Realtime finto: il test manda eventi con state.pushRealtime(collezione, tipo, riga).
    const sockets = new Set();
    state.pushRealtime = async (collection, type, row) => {
        const base = `databases.swimwaveup_db.collections.${collection}.documents`;
        const data = { events: [`${base}.${row.$id}.${type}`, `${base}.*.${type}`], channels: [base, `${base}.${row.$id}`], timestamp: new Date().toISOString(), payload: row };
        for (const ws of sockets) ws.send(JSON.stringify({ type: 'event', data }));
    };
    if (page.routeWebSocket) {
        await page.routeWebSocket(/\/v1\/realtime/, (ws) => {
            sockets.add(ws);
            ws.onClose(() => sockets.delete(ws));
            ws.onMessage((raw) => {
                let msg = {};
                try { msg = JSON.parse(String(raw)); } catch { msg = {}; }
                if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
            });
            ws.send(JSON.stringify({ type: 'connected', data: { channels: [], user: state.loggedIn ? { $id: account.$id } : null } }));
        });
    }
    await page.route(/cloud\.appwrite\.io\/v1\//, async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/v1/, '');
        const method = route.request().method();

        if (path.startsWith('/account')) state.accountCalls.push(`${method} ${path}`);
        // Accesso con Google: Appwrite rimanda subito all'indirizzo di ritorno con un token.
        if (/^\/account\/tokens\/oauth2\/\w+$/.test(path)) {
            const to = new URL(url.searchParams.get('success') || '/');
            to.searchParams.set('userId', account.$id);
            to.searchParams.set('secret', 'oauth-secret');
            if (url.searchParams.get('state')) to.searchParams.set('state', url.searchParams.get('state'));
            return route.fulfill({ status: 302, headers: { location: to.toString() } });
        }
        if (path === '/account/sessions/token' && method === 'POST') {
            state.loggedIn = true;
            return json(route, { $id: 'sess-google', userId: account.$id, provider: 'oauth2', current: true });
        }
        if (path === '/account/identities' && method === 'GET') {
            const identities = state.googleLinked ? [{ $id: 'ident1', userId: account.$id, provider: 'google', providerUid: 'g1', providerEmail: account.email, providerAccessToken: '', providerAccessTokenExpiry: '', providerRefreshToken: '' }] : [];
            return json(route, { total: identities.length, identities });
        }
        if (path === '/account' && method === 'GET') {
            if (state.loggedIn && (!state.mfaRequired || state.mfaDone)) return json(route, { ...account, mfa: !!state.mfaRequired });
            if (state.loggedIn && state.mfaRequired) return json(route, { message: 'More factors are required', code: 401, type: 'user_more_factors_required' }, 401);
            return json(route, { message: 'Unauthorized', code: 401, type: 'general_unauthorized_scope' }, 401);
        }
        if (path === '/account/sessions/email' && method === 'POST') {
            let body = {};
            try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
            if (state.password && body.password !== state.password) {
                return json(route, { message: 'Invalid credentials. Please check the email and password.', code: 401, type: 'user_invalid_credentials' }, 401);
            }
            state.loggedIn = true;
            return json(route, { $id: 'sess1', userId: account.$id, current: true });
        }
        if (/^\/account\/mfa\/challenges?$/.test(path) && method === 'POST') return json(route, { $id: 'challenge1', userId: account.$id, expire: new Date(Date.now() + 600_000).toISOString() });
        if (/^\/account\/mfa\/challenges?$/.test(path) && method === 'PUT') {
            let body = {};
            try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
            if (state.mfaCode && body.otp !== state.mfaCode) return json(route, { message: 'Invalid token passed in the request.', code: 401, type: 'user_invalid_token' }, 401);
            state.mfaDone = true;
            return json(route, {});
        }
        if (path.startsWith('/account/sessions') && method === 'DELETE') { state.loggedIn = false; return json(route, {}); }
        if (path === '/account/sessions' && method === 'GET') return json(route, { total: sessions.length, sessions });
        if (path === '/account/logs' && method === 'GET') return json(route, { total: accountLogs.length, logs: accountLogs });
        if (path.startsWith('/account')) return json(route, {});

        if (path.startsWith('/functions/api/executions')) {
            let action = '';
            let params = {};
            try { ({ action = '', ...params } = JSON.parse(JSON.parse(route.request().postData() || '{}').body || '{}')); } catch { action = ''; }
            state.calls.push({ action, params });
            const handler = state.responses?.[action] || apiResponses[action];
            const data = handler ? handler(params) : {};
            return json(route, { $id: 'x', status: 'completed', responseStatusCode: 200, responseBody: JSON.stringify({ ok: true, data }) });
        }

        // Storage: caricamento (CV, allegati) e lettura dei file privati.
        const upload = path.match(/^\/storage\/buckets\/([^/]+)\/files$/);
        if (upload && method === 'POST') {
            state.uploads = (state.uploads || 0) + 1;
            return json(route, { $id: `upl${state.uploads}`, bucketId: upload[1], name: 'file.pdf', mimeType: 'application/pdf', sizeOriginal: 120000, $permissions: [] });
        }
        if (/^\/storage\/buckets\/[^/]+\/files\/[^/]+\/(view|download|preview)$/.test(path)) {
            return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%mock\n' });
        }
        if (/^\/storage\/buckets\/[^/]+\/files\/[^/]+$/.test(path) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });

        const one = path.match(/^\/databases\/[^/]+\/collections\/([^/]+)\/documents\/([^/]+)$/);
        if (one) {
            if (state.missing?.[one[1]]?.includes(one[2])) return json(route, { message: 'Not found', code: 404, type: 'document_not_found' }, 404);
            const row = withOverrides(one[1], state).find((r) => r.$id === one[2]);
            return row ? json(route, row) : json(route, { message: 'Not found', code: 404, type: 'document_not_found' }, 404);
        }
        const list = path.match(/^\/databases\/[^/]+\/collections\/([^/]+)\/documents$/);
        if (list && method === 'GET') {
            const queries = [...url.searchParams.entries()].filter(([k]) => k.startsWith('queries')).map(([, v]) => v);
            const rows = applyQueries(withOverrides(list[1], state), queries);
            return json(route, { total: rows.length, documents: rows });
        }
        return json(route, {});
    });
}
