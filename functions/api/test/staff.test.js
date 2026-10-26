/** Test dell'area staff: inviti per chi lavora già in struttura, limite Base, le mie strutture, modifica dei turni. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { BASE_STAFF } from '../src/billing.js';

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
        if (q.method === 'greaterThanEqual') rows = rows.filter((d) => d[q.attribute] >= q.values[0]);
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
const rejects = async (p, status, code) => {
  try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); if (code) assert.equal(e.code, code); }
};

test('inviti nello staff, limite Base, le mie strutture, turni', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Piscina Lido', staff: [] });
  P('anna'); P('bob'); P('altra', { userType: 'structure', structureName: 'Altra' });
  const notes = (u, type) => Object.values(col('notifications')).filter((n) => n.userId === u && (!type || n.type === type));

  // Solo gli amministratori invitano; non le strutture, né chi è già nello staff.
  await rejects(api.inviteStaff('anna', { structureId: 'lido', userId: 'bob' }), 403);
  await rejects(api.inviteStaff('lido', { structureId: 'lido', userId: 'altra' }), 404);
  assert.deepEqual(await api.inviteStaff('lido', { structureId: 'lido', userId: 'anna' }), { invited: true });
  assert.equal(notes('anna', 'staff_invite').length, 1);
  assert.equal((await api.inviteStaff('lido', { structureId: 'lido', userId: 'anna' })).already, true); // niente doppioni
  assert.equal(Object.values(col('staff_invites'))[0].$permissions.length, 0); // nessun permesso per i client

  // La persona vede l'invito, lo accetta ed entra nello staff (finché non accetta, non è staff).
  await rejects(api.getTeamBoard('anna', { structureId: 'lido' }), 403);
  const mine = await api.listMyStaffInvites('anna');
  assert.deepEqual(mine.map((i) => [i.structureId, i.name]), [['lido', 'Piscina Lido']]);
  assert.deepEqual(await api.respondStaffInvite('anna', { structureId: 'lido', accept: true }), { joined: true, structureId: 'lido' });
  assert.deepEqual(col('profiles').lido.staff, ['anna']);
  assert.ok(notes('lido').some((n) => n.content.includes('è entrato nello staff')));
  await rejects(api.respondStaffInvite('anna', { structureId: 'lido', accept: true }), 404); // già gestito
  assert.deepEqual((await api.listMyTeams('anna')).map((t) => [t.structureId, t.role]), [['lido', 'staff']]);

  // Rifiuto e ritiro.
  await api.inviteStaff('lido', { structureId: 'lido', userId: 'bob' });
  const board = await api.getTeamBoard('lido', { structureId: 'lido' });
  assert.deepEqual(board.invites.map((i) => i.userId), ['bob']);
  assert.equal(board.staffLimit, BASE_STAFF);
  await api.cancelStaffInvite('lido', { structureId: 'lido', userId: 'bob' });
  assert.equal((await api.listMyStaffInvites('bob')).length, 0);
  await api.inviteStaff('lido', { structureId: 'lido', userId: 'bob' });
  assert.deepEqual(await api.respondStaffInvite('bob', { structureId: 'lido', accept: false }), { joined: false });
  assert.deepEqual(col('profiles').lido.staff, ['anna']);

  // Limite Base: staff + inviti in attesa fino a BASE_STAFF.
  for (let i = 0; i < BASE_STAFF - 1; i++) { P(`p${i}`); await api.inviteStaff('lido', { structureId: 'lido', userId: `p${i}` }); }
  P('extra');
  await rejects(api.inviteStaff('lido', { structureId: 'lido', userId: 'extra' }), 402, 'premium_required');

  // Turni: l'amministratore sposta e riassegna, gli interessati sono avvisati.
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const shift = await api.createShift('lido', { structureId: 'lido', userId: 'anna', date: day, shiftTime: '07:00–13:00' });
  await api.respondShift('anna', { shiftId: shift.$id, status: 'confirmed' });
  await rejects(api.updateShift('anna', { shiftId: shift.$id, date: later }), 403);
  await rejects(api.updateShift('lido', { shiftId: shift.$id, shiftTime: '13:00–07:00' }), 400);
  const moved = await api.updateShift('lido', { shiftId: shift.$id, date: later, shiftTime: '14:00–20:00' });
  assert.deepEqual([moved.date, moved.shiftTime, moved.status], [later, '14:00–20:00', 'scheduled']); // va riconfermato
  assert.ok(notes('anna', 'shift').some((n) => n.content.includes('ha modificato il tuo turno')));
  await api.respondStaffInvite('p0', { structureId: 'lido', accept: true });
  const reassigned = await api.updateShift('lido', { shiftId: shift.$id, userId: 'p0' });
  assert.equal(reassigned.userId, 'p0');
  assert.ok(notes('anna', 'shift').some((n) => n.content.includes('assegnato a un collega')));
  await rejects(api.updateShift('lido', { shiftId: shift.$id, userId: 'bob' }), 400); // non è staff
});
