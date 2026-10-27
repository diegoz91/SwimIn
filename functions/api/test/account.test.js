/** Eliminazione dell'account: non restano righe legate alla persona (turni, cambi, chat staff, segnali…). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

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

test('eliminare l’account toglie anche turni, cambi, chat staff, segnali e note interne', async () => {
  const { db, col } = makeDb();
  const deleted = [];
  const api = createApi(db, { users: { get: async ({ userId }) => ({ $id: userId, email: `${userId}@esempio.it`, labels: [] }), delete: async ({ userId }) => deleted.push(userId) } });
  const put = (table, id, data) => (col(table)[id] = { $id: id, ...data });
  put('profiles', 'lido', { userType: 'structure', structureName: 'Lido', staff: ['anna'] });
  put('profiles', 'anna', { userType: 'professional', firstName: 'Anna', connections: [] });
  put('jobs', 'j1', { structureId: 'lido', title: 'Istruttore' });
  put('applications', 'a1', { jobId: 'j1', applicantId: 'anna', status: 'accepted' });
  put('application_reviews', 'a1', { jobId: 'j1', applicationId: 'a1', rating: 4 });
  put('shifts', 's1', { structureId: 'lido', userId: 'anna', date: '2030-01-01' });
  put('shift_swaps', 'w1', { structureId: 'lido', shiftId: 's1', fromUserId: 'anna', toUserId: '', status: 'pending' });
  put('shift_swaps', 'w2', { structureId: 'lido', shiftId: 's9', fromUserId: 'bob', toUserId: 'anna', status: 'pending' });
  put('staff_chat_reads', 'r1', { structureId: 'lido', userId: 'anna' });
  put('signals', 'g1', { userId: 'anna', topic: 'team:lido' });
  put('typing', 't1', { userId: 'anna', targetId: 'lido' });

  await api.deleteAccount('anna', { confirmation: 'ELIMINA' });
  assert.deepEqual(deleted, ['anna']);
  for (const table of ['applications', 'application_reviews', 'shifts', 'shift_swaps', 'staff_chat_reads', 'signals', 'typing']) {
    assert.deepEqual(Object.keys(col(table)), [], `${table}: righe rimaste`);
  }
  assert.deepEqual(col('profiles').lido.staff, []);

  // La struttura che chiude l'account porta via modelli, chat staff e cambi turno.
  put('shift_templates', 'm1', { structureId: 'lido', name: 'Estate' });
  put('staff_messages', 'x1', { structureId: 'lido', authorId: 'lido', content: 'ciao' });
  put('shift_swaps', 'w3', { structureId: 'lido', shiftId: 's2', fromUserId: 'bob', toUserId: '', status: 'pending' });
  await api.deleteAccount('lido', { confirmation: 'ELIMINA' });
  for (const table of ['shift_templates', 'staff_messages', 'shift_swaps', 'jobs']) assert.deepEqual(Object.keys(col(table)), [], `${table}: righe rimaste`);
});
