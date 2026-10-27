/** Errori passeggeri di Appwrite (es. "503 first byte timeout" del CDN): riprova, niente doppioni, poche richieste insieme. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, withRetry, isTransient, mapLimit } from '../src/main.js';
import { readableMessage } from '../src/ops.js';

const VARNISH = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html><head><title>503 first byte timeout</title></head><body><h1>Error 503 first byte timeout</h1><p>Varnish cache server</p></body></html>`;
const transient = () => Object.assign(new Error(VARNISH), { code: 503 });
const noWait = { sleep: async () => {} };

test('errori passeggeri riconosciuti, quelli veri no', () => {
  assert.equal(isTransient(transient()), true);
  assert.equal(isTransient(new Error(VARNISH)), true);
  assert.equal(isTransient(Object.assign(new Error('x'), { code: 429 })), true);
  assert.equal(isTransient(Object.assign(new Error('fetch failed'), {})), true);
  for (const code of [400, 401, 403, 404, 409]) assert.equal(isTransient(Object.assign(new Error('x'), { code })), false);
});

test('withRetry: riprova due volte, poi si arrende; gli errori veri subito', async () => {
  let n = 0;
  assert.equal(await withRetry(async () => { if (++n < 3) throw transient(); return 'ok'; }, noWait), 'ok');
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw transient(); }, noWait));
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw Object.assign(new Error('no'), { code: 403 }); }, noWait));
  assert.equal(n, 1);
});

test('mapLimit: stesso risultato di Promise.all, ma al massimo N alla volta', async () => {
  let running = 0, peak = 0;
  const out = await mapLimit([...Array(30).keys()], 8, async (x) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    return x * 2;
  });
  assert.deepEqual(out, [...Array(30).keys()].map((x) => x * 2));
  assert.ok(peak <= 8, `picco ${peak}`);
  assert.deepEqual(await mapLimit([], 8, async () => 1), []);
});

test('eliminazioni in massa: un 503 a metà non interrompe deleteAccount né lascia righe', async () => {
  const rows = Object.fromEntries([...Array(150).keys()].map((i) => [`n${i}`, { $id: `n${i}`, userId: 'anna', isRead: false }]));
  let running = 0, peak = 0;
  const failedOnce = new Set();
  const db = {
    async getRow({ tableId, rowId }) {
      const d = tableId === 'notifications' ? rows[rowId] : null;
      if (!d) throw Object.assign(new Error('nf'), { code: 404 });
      return { ...d };
    },
    async listRows({ tableId, queries }) {
      if (tableId !== 'notifications') return { total: 0, rows: [] };
      let lim = 25;
      for (const q of queries.map((x) => JSON.parse(x))) if (q.method === 'limit') lim = q.values[0];
      const all = Object.values(rows);
      return { total: all.length, rows: all.slice(0, lim) };
    },
    async deleteRow({ rowId }) {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      // La prima volta ogni decima riga "va in timeout" dopo essere stata cancellata davvero.
      if (Number(rowId.slice(1)) % 10 === 0 && !failedOnce.has(rowId)) {
        failedOnce.add(rowId);
        delete rows[rowId];
        throw transient();
      }
      if (!rows[rowId]) throw Object.assign(new Error('nf'), { code: 404 });
      delete rows[rowId];
    },
    async createRow() { throw new Error('non previsto'); },
    async updateRow() { throw new Error('non previsto'); },
  };
  const api = createApi(db, { retry: noWait });
  // removeAll è interno: lo esercita la pulizia notturna (notifiche oltre i 12 mesi).
  await api._nightlyCleanup({ now: Date.now() + 400 * 86_400_000 });
  assert.equal(Object.keys(rows).length, 0, 'tutte le notifiche vecchie eliminate');
  assert.ok(peak <= 8, `al massimo 8 eliminazioni insieme (picco ${peak})`);
  assert.equal(failedOnce.size, 15);
});

test('creazione: se la risposta si perde ma la riga c\'è, nessun doppione', async () => {
  const store = {};
  let calls = 0;
  const db = {
    async getRow({ rowId }) { if (!store[rowId]) throw Object.assign(new Error('nf'), { code: 404 }); return store[rowId]; },
    async createRow({ rowId, data }) {
      calls++;
      if (store[rowId]) throw Object.assign(new Error('exists'), { code: 409 });
      store[rowId] = { $id: rowId, ...data };
      if (calls === 1) throw transient(); // salvata, ma la risposta non arriva
      return store[rowId];
    },
    async listRows() { return { total: 0, rows: [] }; },
  };
  const api = createApi(db, { retry: noWait });
  const row = await api._recordError({ source: 'server', action: 'x', message: 'prova' }).catch((e) => e);
  assert.ok(!(row instanceof Error), String(row));
  assert.equal(Object.keys(store).length, 1);
  assert.equal(calls, 2);
});

test('messaggio leggibile per le pagine d\'errore HTML', () => {
  assert.equal(readableMessage(VARNISH), 'Risposta HTML dal servizio: 503 first byte timeout');
  assert.equal(readableMessage('Timeout del database'), 'Timeout del database');
  assert.equal(readableMessage('<html><body>niente</body></html>'), 'Risposta HTML dal servizio: pagina d’errore');
});
