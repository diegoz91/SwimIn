/** Test delle correzioni di sicurezza e della chat staff. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  let clock = Date.now() - 3_600_000;
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25; let desc = false;
      for (const raw of queries) {
        const q = JSON.parse(raw); const a = q.attribute; const v = q.values?.[0];
        if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[a]));
        if (q.method === 'notEqual') rows = rows.filter((d) => !q.values.includes(d[a]));
        if (q.method === 'contains') rows = rows.filter((d) => (d[a] || []).some((x) => q.values.includes(x)));
        if (q.method === 'greaterThan') rows = rows.filter((d) => d[a] > v);
        if (q.method === 'lessThan') rows = rows.filter((d) => d[a] < v);
        if (q.method === 'greaterThanEqual') rows = rows.filter((d) => d[a] >= v);
        if (q.method === 'orderDesc') desc = true;
        if (q.method === 'limit') lim = v;
      }
      rows.sort((x, y) => (x.$createdAt < y.$createdAt ? -1 : 1));
      if (desc) rows.reverse();
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) {
      clock += 1000;
      const d = { $id: rowId, $createdAt: new Date(clock).toISOString(), $permissions: permissions || [], ...data };
      col(tableId)[rowId] = d; return structuredClone(d);
    },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col, now: () => clock };
};

test('sicurezza: righe in sola lettura, gruppi, annunci, scrittura, eventi, limiti', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { connections: ['bob'] }); P('bob', { connections: ['anna'] }); P('carla'); P('piscina', { userType: 'structure', structureName: 'Piscina Blu' });
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };

  // Commenti: nessun permesso di modifica per il client (prima si poteva cambiare l'autore).
  const post = await api.createPost('anna', { content: 'Ciao a tutti' });
  const c = await api.createComment('bob', { postId: post.$id, content: 'Ciao!' });
  assert.deepEqual(c.$permissions, ['read("users")']);

  // Gruppi: commenta solo chi è membro; l'amministratore modera i commenti.
  const g = await api.createGroup('anna', { name: 'Master Lombardia', description: 'Allenamenti e gare per chi nuota master in Lombardia.', privacy: 'approval' });
  const gp = await api.createPost('anna', { content: 'Gara domenica?', groupId: g.$id });
  await rejects(api.createComment('carla', { postId: gp.$id, content: 'Io!' }), 403);
  await api.joinGroup('bob', { groupId: g.$id });
  await api.moderateMember('anna', { groupId: g.$id, userId: 'bob', action: 'approve' });
  const gc = await api.createComment('bob', { postId: gp.$id, content: 'Ci sono' });
  await api.joinGroup('carla', { groupId: g.$id });
  await api.moderateMember('anna', { groupId: g.$id, userId: 'carla', action: 'approve' });
  await rejects(api.deleteComment('carla', { commentId: gc.$id }), 403);
  await api.moderateMember('anna', { groupId: g.$id, userId: 'carla', action: 'promote' });
  assert.deepEqual(await api.deleteComment('carla', { commentId: gc.$id }), { deleted: true });

  // Annunci: in sola lettura per il client; chiusura e riapertura via Function con il limite Base.
  const jobData = (t) => ({ structureId: 'piscina', title: t, description: 'Cerchiamo assistenti bagnanti per la stagione estiva.', role: 'assistente bagnanti', contractType: 'stagionale', city: 'Milano', province: 'MI' });
  const j1 = await api.createJob('piscina', jobData('Bagnino 1'));
  assert.deepEqual(j1.$permissions, ['read("users")']);
  await api.createJob('piscina', jobData('Bagnino 2'));
  await api.createJob('piscina', jobData('Bagnino 3'));
  await rejects(api.closeJob('anna', { jobId: j1.$id }), 403);
  assert.equal((await api.closeJob('piscina', { jobId: j1.$id })).isActive, false);
  await api.createJob('piscina', jobData('Bagnino 4'));
  await rejects(api.reopenJob('piscina', { jobId: j1.$id }), 402); // già 3 attivi con il piano Base
  col('profiles').piscina.premiumUntil = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal((await api.reopenJob('piscina', { jobId: j1.$id })).isActive, true);

  // Candidature: il candidato non può più cancellarle direttamente (c'è withdrawApplication).
  const app = await api.applyForJob('bob', { jobId: j1.$id, coverLetter: 'Ho il brevetto FIN.' });
  assert.ok(!(app.$permissions || []).some((p) => p.startsWith('delete(')));

  // "Sta scrivendo": leggibile solo dal destinatario, mai sul profilo pubblico.
  await api.setPresence('anna', { typingTo: 'bob' });
  assert.deepEqual(col('typing').anna.$permissions, ['read("user:bob")']);
  assert.equal(col('profiles').anna.typingTo, undefined);
  await api.setPresence('anna', { typingTo: 'carla' });
  assert.deepEqual([col('typing').anna.targetId, col('typing').anna.$permissions], ['carla', ['read("user:carla")']]);
  await rejects(api.setPresence('anna', { typingTo: 'anna' }), 400);

  // Eventi online: il link non è sulla riga pubblica, lo ricevono organizzatore e iscritti.
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const ev = await api.createSwimMeet('anna', { title: 'Webinar didattica', description: 'Giochi per l’acquaticità dei più piccoli.', type: 'webinar', date: day, time: '21:00', isOnline: true, onlineUrl: 'https://meet.example.com/x', maxParticipants: 2 });
  assert.equal(col('swim_meets')[ev.$id].onlineUrl, undefined);
  assert.equal((await api.getEventLink('anna', { meetId: ev.$id })).onlineUrl, 'https://meet.example.com/x');
  await rejects(api.getEventLink('bob', { meetId: ev.$id }), 403);
  await api.joinSwimMeet('bob', { meetId: ev.$id });
  assert.equal((await api.getEventLink('bob', { meetId: ev.$id })).onlineUrl, 'https://meet.example.com/x');
  await api.joinSwimMeet('carla', { meetId: ev.$id }); // in lista d'attesa: niente link
  await rejects(api.getEventLink('carla', { meetId: ev.$id }), 403);
  await api.updateSwimMeet('anna', { meetId: ev.$id, onlineUrl: 'https://meet.example.com/nuovo' });
  assert.equal(col('event_private')[ev.$id].onlineUrl, 'https://meet.example.com/nuovo');
  assert.ok(Object.values(col('notifications')).some((n) => n.userId === 'bob' && n.content.includes('è cambiato')));

  // Limite anti-spam sui messaggi: 30 al minuto.
  for (let i = 0; i < 30; i++) col('messages')[`m${i}`] = { $id: `m${i}`, senderId: 'anna', receiverId: 'bob', conversationId: 'anna_bob', content: 'x', $createdAt: new Date().toISOString() };
  await rejects(api.sendMessage('anna', { receiverId: 'bob', content: 'ancora' }), 429);
});

test('chat staff: solo amministratori e staff della struttura', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Lido', staff: ['sara', 'luca'], connections: ['fan'] }); P('sara'); P('luca'); P('fan', { connections: ['lido'] });
  col('facilities').f1 = { $id: 'f1', name: 'Piscina Comunale', admins: ['gestore'], staff: ['sara'] }; P('gestore');
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };

  // Un collegamento o un follower non è staff.
  await rejects(api.listStaffMessages('fan', { structureId: 'lido' }), 403);
  await rejects(api.sendStaffMessage('fan', { structureId: 'lido', content: 'ciao' }), 403);

  const m1 = await api.sendStaffMessage('lido', { structureId: 'lido', content: 'Domani vasca chiusa fino alle 10.' });
  assert.deepEqual(m1.$permissions, []); // nessun permesso: si legge solo tramite la Function
  await api.sendStaffMessage('sara', { structureId: 'lido', content: 'Ricevuto, sposto il corso.' });
  await rejects(api.sendStaffMessage('sara', { structureId: 'lido', content: '   ' }), 400);

  // Non letti nella bacheca dello staff; leggere la chat li azzera.
  assert.equal((await api.getTeamBoard('luca', { structureId: 'lido' })).chatUnread, 2);
  const read = await api.listStaffMessages('luca', { structureId: 'lido' });
  assert.deepEqual(read.messages.map((m) => m.content), ['Domani vasca chiusa fino alle 10.', 'Ricevuto, sposto il corso.']);
  assert.ok(read.members.some((m) => m.$id === 'lido' && m.role === 'admin'));
  assert.equal((await api.getTeamBoard('luca', { structureId: 'lido' })).chatUnread, 0);
  assert.equal((await api.getTeamBoard('sara', { structureId: 'lido' })).chatUnread, 0); // chi scrive ha letto

  // Solo i nuovi messaggi con `after`.
  const last = read.messages[read.messages.length - 1].$createdAt;
  const m3 = await api.sendStaffMessage('luca', { structureId: 'lido', content: 'Ok' });
  assert.deepEqual((await api.listStaffMessages('sara', { structureId: 'lido', after: last })).messages.map((m) => m.$id), [m3.$id]);

  // Eliminare: l'autore o un amministratore.
  await rejects(api.deleteStaffMessage('sara', { messageId: m3.$id }), 403);
  await api.deleteStaffMessage('lido', { messageId: m3.$id });
  assert.equal(col('staff_messages')[m3.$id], undefined);

  // Chi esce dallo staff perde subito l'accesso.
  await api.removeStaffMember('lido', { structureId: 'lido', staffId: 'luca' });
  await rejects(api.listStaffMessages('luca', { structureId: 'lido' }), 403);

  // Le chat di strutture diverse restano separate (pagina struttura con amministratore).
  await api.sendStaffMessage('gestore', { structureId: 'f1', content: 'Benvenuta Sara' });
  assert.deepEqual((await api.listStaffMessages('sara', { structureId: 'f1' })).messages.map((m) => m.content), ['Benvenuta Sara']);
  await rejects(api.listStaffMessages('lido', { structureId: 'f1' }), 403);
});
