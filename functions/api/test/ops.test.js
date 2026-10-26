/** Affidabilità: registro errori con avvisi agli amministratori e stato del servizio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { fingerprintOf } from '../src/ops.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute]));
        if (q.method === 'contains') rows = rows.filter((d) => (d[q.attribute] || []).some((v) => q.values.includes(v)));
        if (q.method === 'limit') lim = q.values[0];
      }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};

const accounts = {
  boss: { $id: 'boss', email: 'boss@swimin.it', labels: ['admin'] },
  anna: { $id: 'anna', email: 'anna@esempio.it', labels: [] },
  prova: { $id: 'prova', email: 'swimin-e2e+r123-s@example.com', labels: [] },
};
const users = {
  get: async ({ userId }) => accounts[userId] ?? (() => { throw new Error('nf'); })(),
  list: async () => ({ users: Object.values(accounts).filter((u) => u.labels.includes('admin')) }),
  delete: async () => {},
};

test('impronta degli errori: stessi errori, stessa impronta', () => {
  const a = fingerprintOf('server', 'createJob', 'Row with the requested ID 66f1a2b3c4d5e6f7a8b9 could not be found');
  const b = fingerprintOf('server', 'createJob', 'Row with the requested ID 0011223344556677aabb could not be found');
  assert.equal(a, b);
  assert.notEqual(a, fingerprintOf('server', 'applyForJob', 'Row with the requested ID 0011 could not be found'));
  assert.notEqual(a, fingerprintOf('client', 'createJob', 'Row with the requested ID 0011 could not be found'));
  assert.match(a, /^s[0-9a-f]{8}$/);
});

test('errori registrati e un solo avviso agli amministratori', async () => {
  const { db, col } = makeDb();
  const hooks = [];
  const fetchImpl = async (url, init) => { hooks.push([url, JSON.parse(init.body)]); return { ok: true }; };
  const api = createApi(db, { users, fetchImpl, alertWebhook: 'https://hooks.example/abc' });
  const alerts = () => Object.values(col('notifications')).filter((n) => n.type === 'system_alert');

  const first = await api._recordError({ source: 'server', userId: 'anna', action: 'createJob', message: 'Timeout del database', stack: 'Error: Timeout' });
  assert.equal(first.alerted, true);
  assert.equal(alerts().length, 1);
  assert.equal(alerts()[0].userId, 'boss');
  assert.match(alerts()[0].content, /nel server \(createJob\): Timeout del database/);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0][0], 'https://hooks.example/abc');
  assert.match(hooks[0][1].text, /^SwimIn: errore nel server/);

  // Lo stesso errore ripetuto: si registra ma non si avvisa di nuovo.
  const again = await api._recordError({ source: 'server', userId: 'anna', action: 'createJob', message: 'Timeout del database' });
  assert.equal(again.alerted, false);
  assert.equal(alerts().length, 1);
  const rows = Object.values(col('client_errors'));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].$permissions, []);
  assert.equal(rows[0].source, 'server');

  // Errori dell'app: stesso registro, con limite per persona.
  const c = await api.logClientError('anna', { message: 'TypeError: x is undefined', url: '/home' });
  assert.equal(c.alerted, true);
  assert.match(alerts().at(-1).content, /nell’app \(\/home\)/);
  for (let i = 0; i < 12; i++) await api.logClientError('anna', { message: `Errore ${i}` });
  assert.equal((await api.logClientError('anna', { message: 'Ancora' })).throttled, true);

  // Solo gli amministratori leggono il registro.
  await assert.rejects(api.adminListErrors('anna'), /amministratori/);
  assert.ok((await api.adminListErrors('boss')).length >= 3);
});

test('stato del servizio: solo amministratori, leggibile da tutti', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  assert.deepEqual(await api._appStatus(), { mode: 'ok', message: '', until: '', updatedAt: null });
  await assert.rejects(api.adminSetAppStatus('anna', { mode: 'maintenance', message: 'Aggiornamento in corso' }), /amministratori/);
  await assert.rejects(api.adminSetAppStatus('boss', { mode: 'chiuso', message: 'x' }), /non valido/);
  await assert.rejects(api.adminSetAppStatus('boss', { mode: 'maintenance' }), /messaggio/);
  await assert.rejects(api.adminSetAppStatus('boss', { mode: 'degraded', message: 'Chat lenta', until: 'domani' }), /fine non valido/);

  const on = await api.adminSetAppStatus('boss', { mode: 'maintenance', message: 'Aggiornamento del database, torniamo alle 23:30.', until: '2026-10-30T22:30:00.000Z' });
  assert.equal(on.mode, 'maintenance');
  assert.deepEqual(col('app_status').main.$permissions, []); // la lettura per tutti è sulla tabella
  assert.equal((await api._appStatus()).message, 'Aggiornamento del database, torniamo alle 23:30.');

  const off = await api.adminSetAppStatus('boss', { mode: 'ok', message: 'ignorato' });
  assert.deepEqual([off.mode, off.message, off.until], ['ok', '', '']);
});

test('gli annunci della prova automatica non avvisano le persone vere', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  col('profiles').prova = { $id: 'prova', userType: 'structure', structureName: 'Piscina di prova' };
  col('profiles').lido = { $id: 'lido', userType: 'structure', structureName: 'Lido' };
  col('job_alerts').a1 = { $id: 'a1', userId: 'anna', keywords: [], province: '', contractType: '', sosOnly: false };
  col('profiles').anna = { $id: 'anna', userType: 'professional', firstName: 'Anna' };
  const data = { title: 'Istruttore corsi', description: 'Corsi pomeridiani per bambini e ragazzi.', role: 'istruttore', city: 'Milano' };
  assert.equal(await api._isTestAccount('prova'), true);
  assert.equal(await api._isTestAccount('anna'), false);
  const fake = await api.createJob('prova', { ...data, structureId: 'prova' });
  assert.equal(fake.alerted, 0);
  assert.equal(Object.values(col('notifications')).filter((n) => n.userId === 'anna').length, 0);
});
