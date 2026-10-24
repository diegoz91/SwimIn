/** Test degli avvisi di lavoro e degli annunci pubblici (pagina /offerte/:id e Google Jobs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { matchesAlert, keywordsOf } from '../src/alerts.js';

test('corrispondenza degli avvisi', () => {
  const job = { title: 'Assistente bagnanti turni serali', role: 'assistente bagnanti', description: 'Vasca coperta, brevetto FIN.', province: 'MI', contractType: 'part-time', isSOS: false };
  assert.deepEqual(keywordsOf('Bagnino, Città!'), ['bagnino', 'citta']);
  assert.ok(matchesAlert({ query: 'bagnanti', province: 'MI' }, job));
  assert.ok(matchesAlert({ query: 'BAGNANTI serali', province: '' }, job));
  assert.ok(!matchesAlert({ query: 'istruttore', province: '' }, job));
  assert.ok(!matchesAlert({ query: 'bagnanti', province: 'RM' }, job));
  assert.ok(!matchesAlert({ query: '', province: '', contractType: 'stagionale' }, job));
  assert.ok(!matchesAlert({ query: '', province: 'MI', sosOnly: true }, job));
});

test('avvisi di lavoro e annunci pubblici', async () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) { const q = JSON.parse(raw); if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute])); if (q.method === 'limit') lim = q.values[0]; }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna'); P('bob'); P('carla'); P('lido', { userType: 'structure', structureName: 'Lido' });
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };
  const alerts = (u) => Object.values(col('notifications')).filter((n) => n.userId === u && n.type === 'job_alert');

  await rejects(api.createJobAlert('anna', {}), 400);
  await rejects(api.createJobAlert('lido', { query: 'bagnino' }), 403);
  const a1 = await api.createJobAlert('anna', { query: 'bagnanti', province: 'mi' });
  assert.deepEqual([a1.province, a1.$permissions], ['MI', ['read("user:anna")']]);
  assert.equal((await api.createJobAlert('anna', { query: 'bagnanti', province: 'MI' })).$id, a1.$id); // niente doppioni
  await api.createJobAlert('bob', { query: 'istruttore' });
  await api.createJobAlert('carla', { province: 'MI', contractType: 'stagionale' });
  for (let i = 0; i < 9; i++) await api.createJobAlert('bob', { query: `parola${i}` });
  await rejects(api.createJobAlert('bob', { query: 'troppi' }), 409);

  const job = await api.createJob('lido', { structureId: 'lido', title: 'Assistente bagnanti turni serali', description: 'Vasca coperta da 25 m, brevetto FIN richiesto.', role: 'assistente bagnanti', contractType: 'part-time', city: 'Milano', province: 'MI' });
  assert.equal(job.alerted, 1);
  assert.equal(alerts('anna').length, 1);
  assert.ok(alerts('anna')[0].content.includes('Assistente bagnanti turni serali'));
  assert.equal(alerts('bob').length + alerts('carla').length, 0);

  assert.equal((await api.listJobAlerts('anna')).length, 1);
  await rejects(api.deleteJobAlert('bob', { alertId: a1.$id }), 404);
  await api.deleteJobAlert('anna', { alertId: a1.$id });
  assert.equal((await api.listJobAlerts('anna')).length, 0);

  // Annuncio pubblico: dati utili, niente candidati.
  col('jobs')[job.$id].candidates = ['anna'];
  const pub = await api.publicJob(null, { id: job.$id });
  assert.equal(pub.structureName, 'Lido');
  assert.equal(pub.candidates, undefined);
  assert.equal(JSON.stringify(pub).includes('anna'), false);
  assert.deepEqual((await api.publicJobs(null)).map((j) => j.id), [job.$id]);
  await api.closeJob('lido', { jobId: job.$id });
  await rejects(api.publicJob(null, { id: job.$id }), 410);
  assert.deepEqual(await api.publicJobs(null), []);
  await rejects(api.publicJob(null, { id: 'nessuno' }), 404);
});
