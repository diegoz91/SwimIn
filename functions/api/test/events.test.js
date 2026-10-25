/** Test degli eventi: tipi, online, modifica, lista d'attesa, gruppi. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

test('eventi con iscrizioni e lista d’attesa', async () => {
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
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return d; },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  const api = createApi(db, { endpoint: 'https://cloud.appwrite.io/v1', users: { delete: async () => {}, get: async () => ({ labels: [] }) } });
  for (const id of ['org', 'a', 'b', 'c', 'd']) col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [] };
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };
  const notifs = (u) => Object.values(col('notifications')).filter((n) => n.userId === u && n.type === 'event').map((n) => n.content);
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const base = { title: 'Corso BLSD', description: 'Corso di rianimazione con defibrillatore per assistenti bagnanti.', date: day, time: '09:00', city: 'Milano' };

  await rejects(api.createSwimMeet('org', { ...base, isOnline: true, city: '' }), 400); // online senza link
  await rejects(api.createSwimMeet('org', { ...base, isOnline: true, onlineUrl: 'http://x.it' }), 400);
  await rejects(api.createSwimMeet('org', { ...base, endTime: '9:5' }), 400);
  await rejects(api.createSwimMeet('org', { ...base, price: -3 }), 400);
  const web = await api.createSwimMeet('org', { ...base, type: 'webinar', isOnline: true, onlineUrl: 'https://meet.example.com/blsd', city: '' });
  assert.deepEqual([web.type, web.city, web.isOnline, web.price], ['webinar', 'Online', true, 0]);

  const ev = await api.createSwimMeet('org', { ...base, type: 'corso', price: 60, province: 'mi', endTime: '13:00', maxParticipants: 3 });
  assert.deepEqual([ev.type, ev.price, ev.province, ev.endTime, ev.waitlist], ['corso', 60, 'MI', '13:00', []]);

  // Posti: 3 (organizzatore compreso); poi lista d'attesa.
  assert.equal((await api.joinSwimMeet('a', { meetId: ev.$id })).myStatus, 'going');
  assert.equal((await api.joinSwimMeet('b', { meetId: ev.$id })).myStatus, 'going');
  assert.equal((await api.joinSwimMeet('c', { meetId: ev.$id })).myStatus, 'waitlist');
  assert.equal((await api.joinSwimMeet('d', { meetId: ev.$id })).myStatus, 'waitlist');
  assert.equal(notifs('org').length, 2);

  // Chi rinuncia libera il posto al primo in attesa.
  await api.leaveSwimMeet('a', { meetId: ev.$id });
  assert.deepEqual([col('swim_meets')[ev.$id].participants, col('swim_meets')[ev.$id].waitlist], [['org', 'b', 'c'], ['d']]);
  assert.ok(notifs('c')[0].includes('Si è liberato un posto'));

  // Modifica: solo l'organizzatore; più posti fanno entrare chi aspetta; il cambio d'orario avvisa gli iscritti.
  await rejects(api.updateSwimMeet('b', { meetId: ev.$id, time: '10:00' }), 403);
  await rejects(api.updateSwimMeet('org', { meetId: ev.$id, maxParticipants: 2 }), 400);
  const up = await api.updateSwimMeet('org', { meetId: ev.$id, time: '10:00', maxParticipants: 5 });
  assert.deepEqual([up.time, up.participants, up.waitlist], ['10:00', ['org', 'b', 'c', 'd'], []]);
  assert.ok(notifs('b').some((n) => n.includes('è cambiato')));

  // Annullamento: avvisati iscritti e lista d'attesa; poi niente più iscrizioni.
  await api.cancelSwimMeet('org', { meetId: ev.$id });
  assert.ok(notifs('d').some((n) => n.includes('annullato')));
  await rejects(api.joinSwimMeet('a', { meetId: ev.$id }), 409);

  // Evento in un gruppo su approvazione: solo i membri possono crearlo e iscriversi.
  const g = await api.createGroup('org', { name: 'Bagnini Milano', description: 'Turni e brevetti per chi lavora nelle piscine di Milano.', privacy: 'approval' });
  await rejects(api.createSwimMeet('a', { ...base, groupId: g.$id }), 403);
  const gev = await api.createSwimMeet('org', { ...base, groupId: g.$id });
  await rejects(api.joinSwimMeet('a', { meetId: gev.$id }), 403);
  await api.joinGroup('a', { groupId: g.$id });
  await api.moderateMember('org', { groupId: g.$id, userId: 'a', decision: 'approve' });
  assert.equal((await api.joinSwimMeet('a', { meetId: gev.$id })).myStatus, 'going');
  await api.deleteGroup('org', { groupId: g.$id });
  assert.equal(col('swim_meets')[gev.$id].status, 'cancelled');

  // Eliminazione dell'account: i propri eventi annullati.
  await api.deleteAccount('org', { confirmation: 'ELIMINA' });
  assert.equal(col('swim_meets')[web.$id].status, 'cancelled');
});
