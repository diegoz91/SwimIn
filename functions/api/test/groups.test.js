/** Test dei gruppi: creazione, iscrizione aperta o su approvazione, moderazione, post. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

test('gruppi e community', async () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) { const q = JSON.parse(raw); if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute])); if (q.method === 'limit') lim = q.values[0]; }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return d; },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [] });
  P('anna'); P('bob'); P('carla');
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };
  const notifs = (u) => Object.values(col('notifications')).filter((n) => n.userId === u && n.type === 'group');

  await rejects(api.createGroup('anna', { name: 'MA', description: 'corta' }), 400);
  await rejects(api.createGroup('anna', { name: 'Master', description: 'Gruppo per chi nuota master in Lombardia', cover: 'https://evil.example/x.png' }), 400);
  const g = await api.createGroup('anna', { name: 'Master Lombardia', description: 'Allenamenti, gare e consigli per chi nuota master in Lombardia.', category: 'master', privacy: 'approval', province: 'mi' });
  assert.deepEqual([g.admins, g.membersCount, g.province, g.privacy], [['anna'], 1, 'MI', 'approval']);

  // Su approvazione: la richiesta resta in attesa, gli amministratori vengono avvisati.
  assert.deepEqual(await api.joinGroup('bob', { groupId: g.$id }), { status: 'pending' });
  assert.equal(notifs('anna').length, 1);
  await rejects(api.createPost('bob', { content: 'Ciao a tutti', groupId: g.$id }), 403);
  await rejects(api.moderateMember('bob', { groupId: g.$id, userId: 'bob', decision: 'approve' }), 403);
  assert.deepEqual(await api.moderateMember('anna', { groupId: g.$id, userId: 'bob', decision: 'approve' }), { membersCount: 2 });
  assert.equal(notifs('bob').length, 1);

  // Post nel gruppo: solo i membri; gli amministratori possono moderarli.
  const post = await api.createPost('bob', { content: 'Chi viene alla gara di domenica? #master', groupId: g.$id });
  assert.equal(post.groupId, g.$id); assert.equal(col('groups')[g.$id].postsCount, 1);
  await rejects(api.deletePost('carla', { postId: post.$id }), 403);
  await api.deletePost('anna', { postId: post.$id });
  assert.equal(col('groups')[g.$id].postsCount, 0);

  // Ruoli: promozione, unico amministratore, uscita.
  await rejects(api.leaveGroup('anna', { groupId: g.$id }), 409);
  await api.moderateMember('anna', { groupId: g.$id, userId: 'bob', decision: 'promote' });
  assert.deepEqual(col('groups')[g.$id].admins, ['anna', 'bob']);
  assert.deepEqual(await api.leaveGroup('anna', { groupId: g.$id }), { left: true });
  assert.deepEqual(col('groups')[g.$id].admins, ['bob']); assert.equal(col('groups')[g.$id].membersCount, 1);

  // Bloccato: non può rientrare.
  await api.joinGroup('carla', { groupId: g.$id });
  await api.moderateMember('bob', { groupId: g.$id, userId: 'carla', decision: 'ban' });
  await rejects(api.joinGroup('carla', { groupId: g.$id }), 403);

  // Gruppo aperto: iscrizione immediata.
  const open = await api.createGroup('carla', { name: 'Bagnini estate', description: 'Turni, brevetti e consigli per chi lavora negli stabilimenti.', privacy: 'open' });
  assert.deepEqual(await api.joinGroup('anna', { groupId: open.$id }), { status: 'active' });
  assert.equal(col('groups')[open.$id].membersCount, 2);

  // Eliminazione dell'account del creatore: il membro rimasto diventa amministratore.
  await api.deleteAccount('carla', { confirmation: 'ELIMINA' });
  assert.deepEqual(col('groups')[open.$id].admins, ['anna']);
  await rejects(api.deleteGroup('bob', { groupId: open.$id }), 403);
  await api.deleteGroup('anna', { groupId: open.$id });
  assert.equal(col('groups')[open.$id], undefined);
});
