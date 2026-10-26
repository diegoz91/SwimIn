/** Selezione: note interne dei candidati e proposta di colloquio. */
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


test('note interne e colloqui', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Lido' });
  P('anna'); P('bob');
  const notes = (u) => Object.values(col('notifications')).filter((n) => n.userId === u);
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const job = await api.createJob('lido', { structureId: 'lido', title: 'Istruttore corsi bambini', description: 'Corsi di nuoto pomeridiani per bambini dai 4 ai 10 anni.', role: 'istruttore', city: 'Milano' });
  const app = await api.applyForJob('anna', { jobId: job.$id });

  // Note: solo chi gestisce l'annuncio, in una tabella che il candidato non legge.
  await assert.rejects(api.saveApplicationReview('anna', { applicationId: app.$id, rating: 5, note: 'io' }), /Non gestisci/);
  await assert.rejects(api.saveApplicationReview('lido', { applicationId: app.$id, rating: 7 }), /0 a 5/);
  await api.saveApplicationReview('lido', { applicationId: app.$id, rating: 4, note: 'Ottima al colloquio telefonico' });
  const reviews = await api.getApplicationReviews('lido', { jobId: job.$id });
  assert.deepEqual([reviews[app.$id].rating, reviews[app.$id].note], [4, 'Ottima al colloquio telefonico']);
  await assert.rejects(api.getApplicationReviews('anna', { jobId: job.$id }), /Non gestisci/);
  assert.deepEqual(col('application_reviews')[app.$id].$permissions, [], 'nessun permesso per i client');
  assert.equal(col('applications')[app.$id].note, undefined, 'la nota non finisce sulla candidatura');

  // Colloquio: proposta, candidatura selezionata, notifica; il candidato chiede un altro orario, poi accetta.
  await assert.rejects(api.proposeInterview('lido', { applicationId: app.$id, date: day(-1), time: '10:00' }), /data/);
  await assert.rejects(api.proposeInterview('lido', { applicationId: app.$id, date: day(3), time: '10:00', mode: 'presenza', place: '' }), /dove/);
  await assert.rejects(api.proposeInterview('lido', { applicationId: app.$id, date: day(3), time: '10:00', mode: 'video', place: 'http://x' }), /https/);
  const p1 = await api.proposeInterview('lido', { applicationId: app.$id, date: day(3), time: '10:00', mode: 'presenza', place: 'Via Lido 1, Milano' });
  assert.equal(p1.status, 'accepted');
  assert.equal(p1.interviewStatus, 'proposed');
  assert.ok(notes('anna').some((n) => /colloquio/.test(n.content)));
  await assert.rejects(api.respondInterview('bob', { applicationId: app.$id, accept: true }), /tuoi colloqui/);
  await assert.rejects(api.respondInterview('anna', { applicationId: app.$id, accept: false, reply: '' }), /disponibile/);
  await api.respondInterview('anna', { applicationId: app.$id, accept: false, reply: 'Giovedì pomeriggio?' });
  assert.equal(col('applications')[app.$id].interviewStatus, 'reschedule');
  assert.ok(notes('lido').some((n) => /altro orario/.test(n.content)));
  await assert.rejects(api.respondInterview('anna', { applicationId: app.$id, accept: true }), /da confermare/);
  await api.proposeInterview('lido', { applicationId: app.$id, date: day(4), time: '15:30', mode: 'video', place: 'https://meet.example.com/abc' });
  await api.respondInterview('anna', { applicationId: app.$id, accept: true });
  assert.equal(col('applications')[app.$id].interviewStatus, 'accepted');
});
