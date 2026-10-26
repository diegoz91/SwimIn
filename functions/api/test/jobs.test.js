/** Test della gestione degli annunci: modifica, elenco della struttura con le candidature per fase, stati. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  let n = 0;
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) { const q = JSON.parse(raw); if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute])); if (q.method === 'limit') lim = q.values[0]; }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date(Date.now() + n++).toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};
const rejects = async (p, status) => {
  try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); }
};

test('annunci: modifica, elenco per la struttura, fasi delle candidature', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Piscina Lido', premiumUntil: new Date(Date.now() + 86400000).toISOString() });
  P('altra', { userType: 'structure', structureName: 'Altra piscina' });
  P('anna'); P('bob'); P('carla');
  const base = { structureId: 'lido', title: 'Istruttore corsi bambini', description: 'Corsi di nuoto per bambini dai 4 ai 10 anni, pomeriggi.', role: 'istruttore', city: 'Milano', province: 'MI' };
  const job = await api.createJob('lido', base);

  // Modifica: solo chi gestisce; campi validati; nuova scadenza da oggi.
  await rejects(api.updateJob('altra', { jobId: job.$id, title: 'Titolo rubato' }), 403);
  await rejects(api.updateJob('lido', { jobId: job.$id, structureId: 'altra' }), 400); // campo non modificabile
  await rejects(api.updateJob('lido', { jobId: job.$id, salaryMin: 2000, salaryMax: 1000 }), 400);
  const edited = await api.updateJob('lido', { jobId: job.$id, title: 'Istruttore corsi bambini e ragazzi', salaryMin: 900, salaryMax: 1300, requirements: ['Esperienza con bambini'], expiryDays: 60 });
  assert.deepEqual([edited.title, edited.salaryMin, edited.requirements], ['Istruttore corsi bambini e ragazzi', 900, ['Esperienza con bambini']]);
  assert.equal(edited.expiresAt, new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
  assert.equal(edited.structureId, 'lido');

  // SOS: solo descrizione e compenso.
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const sos = await api.createJob('lido', { ...base, title: 'Sostituzione bagnino', isSOS: true, sosDate: day });
  await rejects(api.updateJob('lido', { jobId: sos.$id, title: 'Altro titolo' }), 400);
  assert.equal((await api.updateJob('lido', { jobId: sos.$id, salaryMin: 120 })).salaryMin, 120);

  // Candidature e fasi.
  const a = await api.applyForJob('anna', { jobId: job.$id });
  const b = await api.applyForJob('bob', { jobId: job.$id });
  const c = await api.applyForJob('carla', { jobId: job.$id });
  await api.updateApplicationStatus('lido', { applicationId: a.$id, status: 'reviewed' });
  await api.updateApplicationStatus('lido', { applicationId: b.$id, status: 'accepted' });
  await api.updateApplicationStatus('lido', { applicationId: c.$id, status: 'rejected' });
  const notes = Object.values(col('notifications'));
  assert.ok(!notes.some((x) => x.userId === 'anna')); // "vista" non avvisa
  assert.ok(notes.some((x) => x.userId === 'bob' && x.type === 'application_update'));
  assert.ok(notes.some((x) => x.userId === 'carla' && x.type === 'rejected'));
  await rejects(api.updateApplicationStatus('lido', { applicationId: a.$id, status: 'hired' }), 400); // si assume con hireCandidate
  await api.hireCandidate('lido', { applicationId: b.$id });
  await rejects(api.updateApplicationStatus('lido', { applicationId: b.$id, status: 'rejected' }), 409); // già assunto

  const list = await api.listStructureJobs('lido', {});
  assert.equal(list.length, 2);
  const mine = list.find((j) => j.$id === job.$id);
  assert.deepEqual(mine.applications, { total: 3, pending: 0, reviewed: 1, accepted: 0, hired: 1, rejected: 1 });
  assert.equal(mine.isActive, false); // chiuso con l'assunzione
  await rejects(api.listStructureJobs('anna', { structureId: 'lido' }), 403);

  // Annuncio scaduto: niente candidature anche se risulta attivo.
  const old = await api.createJob('lido', { ...base, title: 'Bagnino stagione estiva' });
  col('jobs')[old.$id].expiresAt = '2020-01-01';
  await rejects(api.applyForJob('anna', { jobId: old.$id }), 409);
});
