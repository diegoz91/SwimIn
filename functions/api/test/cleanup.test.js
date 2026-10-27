/** Pulizia notturna: dati scaduti, tempi di conservazione, righe orfane e account di prova. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const match = (d, q) => {
    const v = d[q.attribute];
    if (q.method === 'equal') return q.values.includes(v);
    if (q.method === 'notEqual') return !q.values.includes(v);
    if (q.method === 'lessThan') return v !== undefined && v < q.values[0];
    if (q.method === 'greaterThan') return v !== undefined && v > q.values[0];
    if (q.method === 'contains') return (v || []).some((x) => q.values.includes(x));
    return true;
  };
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25; let after = null;
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'limit') lim = q.values[0];
        else if (q.method === 'cursorAfter') after = q.values[0];
        else rows = rows.filter((d) => match(d, q));
      }
      if (after) rows = rows.slice(rows.findIndex((r) => r.$id === after) + 1);
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};

test('pulizia notturna', async () => {
  const { db, col } = makeDb();
  const now = Date.parse('2026-11-10T02:30:00Z');
  const t = (days) => new Date(now - days * 86_400_000).toISOString();
  const deleted = [];
  const accounts = [
    { $id: 'e2e_old', email: 'swimin-e2e+20261109-abc-candidata@example.com', $createdAt: t(1) },
    { $id: 'e2e_new', email: 'swimin-e2e+20261110-def-struttura@example.com', $createdAt: t(0.01) },
    { $id: 'altro', email: 'swimin-e2e-fan@gmail.com', $createdAt: t(10) },
  ];
  const users = { get: async ({ userId }) => ({ $id: userId, email: `${userId}@x.it`, labels: [] }), delete: async ({ userId }) => deleted.push(userId), list: async () => ({ users: accounts }) };
  const api = createApi(db, { users });
  const put = (table, id, data) => (col(table)[id] = { $id: id, $createdAt: t(0), $updatedAt: t(0), ...data });

  put('profiles', 'lido', { userType: 'structure', structureName: 'Lido', staff: [] });
  put('profiles', 'anna', { userType: 'professional', firstName: 'Anna', connections: [] });
  put('profiles', 'e2e_old', { userType: 'professional', firstName: 'Prova', connections: [] });
  // scaduti
  put('typing', 'ty1', { userId: 'anna', until: t(1) });
  put('typing', 'ty2', { userId: 'anna', until: new Date(now + 5000).toISOString() });
  put('staff_invites', 'i1', { structureId: 'lido', userId: 'anna', status: 'accepted', $updatedAt: t(40) });
  put('staff_invites', 'i2', { structureId: 'lido', userId: 'anna', status: 'pending', $createdAt: t(70) });
  put('staff_invites', 'i3', { structureId: 'lido', userId: 'anna', status: 'pending', $createdAt: t(5) });
  put('shifts', 'sOld', { structureId: 'lido', userId: 'anna', date: '2026-11-01' });
  put('shifts', 'sNew', { structureId: 'lido', userId: 'anna', date: '2026-11-20' });
  put('shift_swaps', 'w1', { structureId: 'lido', shiftId: 'sOld', status: 'pending' });
  put('shift_swaps', 'w2', { structureId: 'lido', shiftId: 'sNew', status: 'pending' });
  put('shift_swaps', 'w3', { structureId: 'lido', shiftId: 'sNew', status: 'accepted', $updatedAt: t(31) });
  put('live_rooms', 'r1', { status: 'ended', $updatedAt: t(31) });
  put('live_messages', 'lm1', { roomId: 'r1' });
  put('live_rooms', 'r2', { status: 'active' });
  // conservazione
  put('client_errors', 'ce1', { userId: 'anna', $createdAt: t(31) });
  put('client_errors', 'ce2', { userId: 'anna', $createdAt: t(2) });
  put('notifications', 'n1', { userId: 'anna', isRead: true, $createdAt: t(91) });
  put('notifications', 'n2', { userId: 'anna', isRead: false, $createdAt: t(91) });
  put('notifications', 'n3', { userId: 'anna', isRead: false, $createdAt: t(400) });
  put('feedback', 'f1', { userId: 'anna', status: 'done', $updatedAt: t(400) });
  put('feedback', 'f2', { userId: 'anna', status: 'open', $updatedAt: t(400) });
  // orfani: annuncio di una vecchia pagina struttura, candidatura senza annuncio, turni di struttura eliminata
  put('jobs', 'jGhost', { structureId: 'pagina_vecchia', title: 'x' });
  put('applications', 'aGhost', { jobId: 'jGhost', applicantId: 'anna' });
  put('jobs', 'jOk', { structureId: 'lido', title: 'ok' });
  put('applications', 'aOk', { jobId: 'jOk', applicantId: 'anna' });
  put('applications', 'aNoJob', { jobId: 'sparito', applicantId: 'anna' });
  put('application_reviews', 'aNoJob', { jobId: 'sparito', rating: 3 });
  put('shifts', 'sGhost', { structureId: 'pagina_vecchia', userId: 'anna', date: '2026-12-01' });
  put('shift_templates', 'm1', { structureId: 'pagina_vecchia', name: 'x' });

  // tempi di conservazione aggiunti con la mappa privacy
  put('reports', 'rp1', { status: 'resolved', $updatedAt: t(400) });
  put('reports', 'rp2', { status: 'open', $updatedAt: t(400) });
  put('staff_messages', 'sm1', { structureId: 'lido', $createdAt: t(400) });
  put('staff_messages', 'sm2', { structureId: 'lido', $createdAt: t(10) });
  put('shifts', 'sAncient', { structureId: 'lido', userId: 'anna', date: '2024-10-01' });
  put('jobs', 'jClosed', { structureId: 'lido', title: 'chiuso', isActive: false, $updatedAt: t(400) });
  put('applications', 'aClosed', { jobId: 'jClosed', applicantId: 'anna' });
  put('audit_log', 'al1', { scope: 'admin', $createdAt: t(400) });
  put('audit_log', 'al2', { scope: 'legal', $createdAt: t(400) });
  put('audit_log', 'al3', { scope: 'legal', $createdAt: t(2000) });

  const out = await api._nightlyCleanup({ now });
  const ids = (table) => Object.keys(col(table)).sort();
  assert.deepEqual(ids('typing'), ['ty2']);
  assert.deepEqual(ids('staff_invites'), ['i3']);
  assert.deepEqual(ids('shift_swaps'), ['w2']);
  assert.deepEqual(ids('live_rooms'), ['r2']);
  assert.deepEqual(ids('live_messages'), []);
  assert.deepEqual(ids('client_errors'), ['ce2']);
  assert.deepEqual(ids('notifications').filter((id) => id.startsWith('n')), ['n2']);
  assert.deepEqual(ids('feedback'), ['f2']);
  assert.deepEqual(ids('jobs'), ['jClosed', 'jOk']);
  assert.deepEqual(ids('reports'), ['rp2']);
  assert.deepEqual(ids('staff_messages'), ['sm2']);
  assert.deepEqual(ids('audit_log'), ['al2']);
  assert.deepEqual(ids('applications'), ['aOk']);
  assert.deepEqual(ids('application_reviews'), []);
  assert.deepEqual(ids('shifts'), ['sNew', 'sOld']);
  assert.deepEqual(ids('shift_templates'), []);
  assert.deepEqual(deleted, ['e2e_old']); // solo l'account di prova vecchio, con l'email esatta
  assert.equal(col('profiles').e2e_old, undefined);
  assert.ok(Object.values(out).every((v) => typeof v === 'number'), JSON.stringify(out));
});
