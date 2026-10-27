#!/usr/bin/env node
/**
 * Controllo periodico della produzione (workflow "Monitor", ogni 10 minuti):
 * - il sito su Vercel risponde (APP_URL) e /api/health dice che Appwrite risponde;
 * - la Function `api` risponde anche chiamata direttamente su Appwrite;
 * - gli errori del server degli ultimi 15 minuti non superano la soglia (con la chiave API).
 * Se qualcosa non va esce con errore: GitHub manda un'email a chi gestisce il repository.
 * Nessuna dipendenza: solo fetch.
 */
import { writeFileSync } from 'node:fs';

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const ENDPOINT = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
const PROJECT = process.env.APPWRITE_PROJECT_ID || '';
const KEY = process.env.APPWRITE_API_KEY || '';
const THRESHOLD = Number(process.env.MONITOR_ERROR_THRESHOLD || 20);
const checks = [];

async function check(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, ms: Date.now() - t, detail: detail || '' });
  } catch (e) {
    checks.push({ name, ok: false, ms: Date.now() - t, detail: e.message });
  }
}

const get = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });

if (APP_URL) {
  await check('Sito', async () => {
    const res = await get(`${APP_URL}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(await res.text()).includes('id="root"')) throw new Error('la pagina non contiene l’app');
  });
  await check('Salute (/api/health)', async () => {
    const res = await get(`${APP_URL}/api/health`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) return 'non ancora pubblicato su Vercel';
    if (!res.ok || !body.ok) throw new Error(`HTTP ${res.status} ${body.error || ''}`.trim());
    return `stato ${body.mode}, ${body.latencyMs} ms`;
  });
}

if (ENDPOINT && PROJECT) {
  await check('Function api su Appwrite', async () => {
    const res = await get(`${ENDPOINT}/functions/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT },
      body: JSON.stringify({ body: JSON.stringify({ action: 'health' }), async: false, path: '/', method: 'POST', headers: { 'content-type': 'application/json' } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ex = await res.json();
    const p = JSON.parse(ex.responseBody || '{}');
    if (!p.ok) throw new Error(`risposta ${ex.responseStatusCode}: ${String(ex.responseBody).slice(0, 120)}`);
    return `versione ${p.data.version || '?'}`;
  });
}

if (ENDPOINT && PROJECT && KEY) {
  await check(`Errori del server (ultimi 15 minuti, soglia ${THRESHOLD})`, async () => {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const q = [
      { method: 'equal', attribute: 'source', values: ['server'] },
      { method: 'greaterThan', attribute: '$createdAt', values: [since] },
      { method: 'limit', values: [1] },
    ].map((x) => `queries[]=${encodeURIComponent(JSON.stringify(x))}`).join('&');
    // API TablesDB: la chiave di deploy ha gli scope rows.*, non quelli vecchi documents.*.
    const res = await get(`${ENDPOINT}/tablesdb/swimwaveup_db/tables/client_errors/rows?${q}`, { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${body.message || ''}`.trim());
    if (body.total >= THRESHOLD) throw new Error(`${body.total} errori: controlla Admin › Errori`);
    return `${body.total} errori`;
  });
}

const failed = checks.filter((c) => !c.ok);
const md = [
  `# Monitor ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  '',
  '| Controllo | Esito |',
  '|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.ok ? `ok (${c.ms} ms)${c.detail ? ` · ${c.detail}` : ''}` : `**problema**: ${c.detail}`} |`),
  '',
].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
if (!checks.length) console.log('Nessun controllo configurato (servono APP_URL e/o i secret APPWRITE_*).');
for (const c of failed) console.log(`::error title=${c.name}::${c.detail}`);
process.exit(failed.length ? 1 : 0);
