/** Test delle referenze scritte: chi può scriverle, approvazione, visibilità, ritiro. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

test('referenze scritte', async () => {
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
    async updateRow({ tableId, rowId, data, permissions }) { Object.assign(col(tableId)[rowId], data); if (permissions) col(tableId)[rowId].$permissions = permissions; return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { connections: ['bob'] }); P('bob', { connections: ['anna'] }); P('carla'); P('lido', { userType: 'structure', structureName: 'Lido', staff: ['carla'] });
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };
  const text = 'Anna è un’istruttrice attenta e precisa: i bambini la adorano e i genitori si fidano di lei.';

  // Solo collegamenti reciproci, staff o rapporti di lavoro.
  await rejects(api.writeRecommendation('carla', { profileId: 'anna', content: text }), 403);
  await rejects(api.writeRecommendation('bob', { profileId: 'anna', content: 'troppo corta' }), 400);
  await rejects(api.writeRecommendation('anna', { profileId: 'lido', content: text }), 403);

  // Scritta: in attesa, visibile solo ad autore e destinataria.
  const r = await api.writeRecommendation('bob', { profileId: 'anna', relationship: 'collega', content: text });
  assert.equal(r.status, 'pending');
  assert.deepEqual(col('recommendations')[r.$id].$permissions, ['read("user:bob")', 'read("user:anna")']);
  assert.equal((await api.listRecommendations('carla', { profileId: 'anna' })).length, 0);
  assert.equal((await api.listRecommendations('anna', { profileId: 'anna' }))[0].author.name, 'bob');

  // Solo la destinataria la pubblica: diventa visibile a tutti.
  await rejects(api.respondRecommendation('bob', { recommendationId: r.$id, action: 'publish' }), 403);
  await api.respondRecommendation('anna', { recommendationId: r.$id, action: 'publish' });
  assert.deepEqual(col('recommendations')[r.$id].$permissions, ['read("users")']);
  assert.equal((await api.listRecommendations('carla', { profileId: 'anna' })).length, 1);

  // Riscritta: torna in attesa e privata.
  await api.writeRecommendation('bob', { profileId: 'anna', content: `${text} Consigliatissima.` });
  assert.equal(Object.keys(col('recommendations')).length, 1);
  assert.equal(col('recommendations')[r.$id].status, 'pending');
  assert.equal((await api.listRecommendations('carla', { profileId: 'anna' })).length, 0);

  // Struttura → membro dello staff.
  const s = await api.writeRecommendation('lido', { profileId: 'carla', relationship: 'collega', content: 'Carla ha coperto tutti i turni serali della stagione con puntualità e grande attenzione.' });
  assert.equal(s.relationship, 'struttura');

  // Richiesta di referenza: notifica una volta sola.
  assert.deepEqual(await api.requestRecommendation('anna', { profileId: 'bob', message: 'Grazie!' }), { requested: true });
  assert.equal((await api.requestRecommendation('anna', { profileId: 'bob' })).already, true);
  await rejects(api.requestRecommendation('carla', { profileId: 'anna' }), 403);

  // Nascondere, ritirare, account eliminato.
  await api.respondRecommendation('carla', { recommendationId: s.$id, action: 'hide' });
  assert.equal(col('recommendations')[s.$id].status, 'hidden');
  await rejects(api.deleteRecommendation('anna', { recommendationId: r.$id }), 403);
  await api.deleteRecommendation('bob', { recommendationId: r.$id });
  assert.equal(col('recommendations')[r.$id], undefined);
  await api.deleteAccount('lido', { confirmation: 'ELIMINA' });
  assert.equal(Object.keys(col('recommendations')).length, 0);
});
