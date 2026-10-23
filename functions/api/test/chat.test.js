/** Test dei messaggi: allegati privati, risposte, reazioni ed eliminazione per tutti. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

test('messaggi con allegati, risposte e reazioni', async () => {
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
  const files = {
    f_anna: { $id: 'f_anna', name: 'turni.pdf', mimeType: 'application/pdf', sizeOriginal: 120_000, $permissions: ['read("user:anna")', 'delete("user:anna")'] },
    f_bob: { $id: 'f_bob', name: 'foto.jpg', mimeType: 'image/jpeg', sizeOriginal: 80_000, $permissions: ['read("user:bob")'] },
    f_exe: { $id: 'f_exe', name: 'x.exe', mimeType: 'application/x-msdownload', sizeOriginal: 1000, $permissions: ['read("user:anna")'] },
  };
  const deleted = [];
  const storage = {
    async getFile({ bucketId, fileId }) { assert.equal(bucketId, 'chat_files'); if (!files[fileId]) throw new Error('nf'); return structuredClone(files[fileId]); },
    async updateFile({ fileId, permissions }) { files[fileId].$permissions = permissions; return files[fileId]; },
    async deleteFile({ fileId }) { deleted.push(fileId); delete files[fileId]; },
  };
  const api = createApi(db, { storage, endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id, connections) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections });
  P('anna', ['bob']); P('bob', ['anna']); P('carla', []);
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };

  await rejects(api.sendMessage('anna', { receiverId: 'bob', content: '   ' }), 400);
  // Solo file propri e di tipo ammesso.
  await rejects(api.sendMessage('anna', { receiverId: 'bob', attachments: ['f_bob'] }), 403);
  await rejects(api.sendMessage('anna', { receiverId: 'bob', attachments: ['f_exe'] }), 400);
  await rejects(api.sendMessage('anna', { receiverId: 'bob', attachments: ['a', 'b', 'c', 'd', 'e'] }), 400);

  // Solo allegato: il destinatario ottiene il permesso di lettura.
  const m1 = await api.sendMessage('anna', { receiverId: 'bob', attachments: [{ fileId: 'f_anna' }] });
  assert.equal(m1.content, '');
  assert.deepEqual(JSON.parse(m1.attachments[0]), { fileId: 'f_anna', name: 'turni.pdf', mime: 'application/pdf', size: 120_000 });
  assert.ok(files.f_anna.$permissions.includes('read("user:bob")'));
  assert.ok(!files.f_anna.$permissions.some((p) => p.includes('carla')));

  // Risposta: anteprima salvata; non si può citare un messaggio di un'altra conversazione.
  const m2 = await api.sendMessage('bob', { receiverId: 'anna', content: 'Grazie, ci sono sabato.', replyToId: m1.$id });
  assert.deepEqual(JSON.parse(m2.replyPreview), { id: m1.$id, senderId: 'anna', text: 'Allegato' });
  col('messages').other = { $id: 'other', conversationId: 'x_y', senderId: 'x', receiverId: 'y', content: 'segreto' };
  await rejects(api.sendMessage('bob', { receiverId: 'anna', content: 'ciao', replyToId: 'other' }), 400);

  // Reazioni: solo i partecipanti.
  assert.deepEqual((await api.reactMessage('anna', { messageId: m2.$id, reaction: 'adoro' })).reactions, { anna: 'adoro' });
  await rejects(api.reactMessage('carla', { messageId: m2.$id, reaction: 'adoro' }), 403);
  await rejects(api.reactMessage('anna', { messageId: m2.$id, reaction: 'boh' }), 400);
  assert.deepEqual((await api.reactMessage('anna', { messageId: m2.$id, reaction: null })).reactions, {});

  // Eliminazione per tutti: solo il mittente; il file viene cancellato.
  await rejects(api.deleteMessage('bob', { messageId: m1.$id }), 403);
  await api.deleteMessage('anna', { messageId: m1.$id });
  assert.deepEqual([col('messages')[m1.$id].deleted, col('messages')[m1.$id].content, col('messages')[m1.$id].attachments], [true, '', []]);
  assert.deepEqual(deleted, ['f_anna']);
  await rejects(api.reactMessage('bob', { messageId: m1.$id, reaction: 'adoro' }), 409);
});
