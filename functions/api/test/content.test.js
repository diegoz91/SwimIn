/** Test di hashtag, menzioni, tendenze, sondaggi e "segui". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { extractHashtags, extractMentions, cleanPoll } from '../src/content.js';

test('estrazione di hashtag, menzioni e sondaggi', () => {
  assert.deepEqual(extractHashtags('Serie #Master e #nuotoLibero! #master #2026 #à #salvamento_FIN, mail a#b'), ['master', 'nuotolibero', 'salvamento_fin']);
  assert.deepEqual(extractHashtags('Link https://x.it/#ancora'), []);
  assert.deepEqual(extractMentions('Grazie @[Marco Bellini](u_marco) e @[Piscina Lido](u_lido), ciao @[Marco Bellini](u_marco)'), ['u_marco', 'u_lido']);
  assert.equal(cleanPoll({ options: ['Sì'], days: 3 }).error, 'Un sondaggio ha da 2 a 4 opzioni.');
  assert.ok(cleanPoll({ options: ['A', 'a'], days: 3 }).error);
  assert.ok(cleanPoll({ options: ['A', 'B'], days: 5 }).error);
  const ok = cleanPoll({ options: [' Mattina ', 'Sera'], days: 7 });
  assert.deepEqual(ok.options, ['Mattina', 'Sera']);
});

test('menzioni, tendenze, sondaggi e segui', async () => {
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
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1' });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna'); P('bob'); P('carla');
  const notifs = (u, type) => Object.values(col('notifications')).filter((n) => n.userId === u && (!type || n.type === type));
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };

  // Post con hashtag e menzione: la persona menzionata riceve l'avviso, una sola volta.
  const post = await api.createPost('anna', { content: 'Allenamento #Master con @[Bob](bob) e @[Anna](anna)' });
  assert.deepEqual(post.hashtags, ['master']); assert.deepEqual(post.mentions, ['bob', 'anna']);
  assert.equal(notifs('bob', 'mention').length, 1); assert.equal(notifs('anna', 'mention').length, 0);
  await api.updatePost('anna', { postId: post.$id, content: 'Allenamento #master #soglia con @[Bob](bob) e @[Carla](carla)' });
  assert.equal(notifs('bob', 'mention').length, 1); assert.equal(notifs('carla', 'mention').length, 1);
  assert.deepEqual(col('posts')[post.$id].hashtags, ['master', 'soglia']);
  await api.createComment('bob', { postId: post.$id, content: 'Ci sto! @[Carla](carla)' });
  assert.equal(notifs('carla', 'mention').length, 2);

  await api.createPost('bob', { content: 'Anche io #master' });
  const trends = await api.getTrends('anna');
  assert.deepEqual(trends[0], { tag: 'master', posts: 2 });

  // Sondaggio: voto, cambio, ritiro; chiuso dopo la scadenza.
  await rejects(api.createPost('anna', { content: 'Quando?', poll: { options: ['Mattina'], days: 3 } }), 400);
  const poll = await api.createPost('anna', { content: 'Quando vi allenate?', poll: { options: ['Mattina', 'Sera'], days: 3 } });
  assert.deepEqual(poll.pollOptions, ['Mattina', 'Sera']);
  assert.deepEqual((await api.votePoll('bob', { postId: poll.$id, option: 1 })).counts, [0, 1]);
  assert.deepEqual((await api.votePoll('carla', { postId: poll.$id, option: 1 })).counts, [0, 2]);
  assert.deepEqual((await api.votePoll('bob', { postId: poll.$id, option: 0 })).counts, [1, 1]);
  assert.deepEqual((await api.votePoll('bob', { postId: poll.$id, option: null })).counts, [0, 1]);
  await rejects(api.votePoll('bob', { postId: poll.$id, option: 5 }), 400);
  await rejects(api.votePoll('bob', { postId: post.$id, option: 0 }), 400);
  col('posts')[poll.$id].pollEndsAt = new Date(Date.now() - 1000).toISOString();
  await rejects(api.votePoll('bob', { postId: poll.$id, option: 0 }), 409);
  assert.deepEqual(Object.values(col('poll_votes'))[0].$permissions, ['read("user:carla")']);

  // Segui senza collegarsi.
  await rejects(api.toggleFollow('anna', { profileId: 'anna' }), 400);
  assert.equal((await api.toggleFollow('anna', { profileId: 'bob' })).following, true);
  assert.equal(col('profiles').bob.followersCount, 1); assert.equal(col('profiles').anna.followingCount, 1);
  assert.equal(notifs('bob', 'follow').length, 1);
  assert.equal((await api.toggleFollow('anna', { profileId: 'bob' })).following, false);
  assert.equal(col('profiles').bob.followersCount, 0);

  // Eliminazione del post: via anche i voti.
  await api.deletePost('anna', { postId: poll.$id });
  assert.equal(Object.keys(col('poll_votes')).length, 0);
});
