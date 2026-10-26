/** Segnali di tempo reale: dopo le azioni che cambiano dati visti da altri, una riga per destinatario. */
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

test('segnali: turni, candidature, chat staff', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Lido', staff: ['anna', 'bob'] });
  P('anna'); P('bob'); P('carla');
  const signals = () => Object.values(col('signals'));
  const forUser = (u, topic) => signals().filter((s) => s.userId === u && s.topic === topic);

  // La struttura assegna un turno ad Anna; Anna lo conferma: struttura e staff ricevono il segnale.
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const shift = await api.createShift('lido', { structureId: 'lido', userId: 'anna', date: day, shiftTime: '09:00–12:00' });
  col('signals') && Object.keys(col('signals')).forEach((k) => delete col('signals')[k]);
  await api.respondShift('anna', { shiftId: shift.$id, status: 'confirmed' });
  assert.ok(forUser('lido', 'team:lido').length === 1, 'la struttura vede subito il turno confermato');
  assert.ok(forUser('bob', 'team:lido').length === 1);
  assert.equal(forUser('carla', 'team:lido').length, 0, 'chi non è nel team non riceve nulla');
  const sig = forUser('lido', 'team:lido')[0];
  assert.deepEqual(sig.$permissions, ['read("user:lido")']); // leggibile solo dal destinatario
  assert.equal(sig.kind, 'respondShift');

  // Chat staff.
  await api.sendStaffMessage('bob', { structureId: 'lido', content: 'Ciao a tutti' });
  assert.equal(forUser('anna', 'staffchat:lido').length, 1);

  // Candidatura: chi gestisce l'annuncio e chi si candida.
  const job = await api.createJob('lido', { structureId: 'lido', title: 'Istruttore corsi bambini', description: 'Corsi di nuoto pomeridiani per bambini dai 4 ai 10 anni.', role: 'istruttore', city: 'Milano' });
  const app = await api.applyForJob('carla', { jobId: job.$id });
  assert.equal(forUser('lido', `job:${job.$id}`).length, 1);
  const seen = forUser('carla', `job:${job.$id}`).length;
  await api.updateApplicationStatus('lido', { applicationId: app.$id, status: 'accepted' });
  assert.equal(forUser('carla', `job:${job.$id}`).length, seen + 1, 'chi si candida vede subito la selezione');

  // Un'azione rifiutata non manda segnali.
  const before = signals().length;
  await assert.rejects(api.respondShift('bob', { shiftId: shift.$id, status: 'confirmed' }));
  assert.equal(signals().length, before);
});
