/** Turni ricorrenti, modelli settimanali e scambi tra colleghi. */
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


const setup = () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Lido', staff: ['anna', 'bob', 'carla'] });
  P('anna'); P('bob'); P('carla'); P('dario');
  const notes = (u) => Object.values(col('notifications')).filter((n) => n.userId === u);
  return { api, col, notes };
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const monday = () => { const d = new Date(Date.now() + 7 * 86400000); const wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - wd * 86400000).toISOString().slice(0, 10); };

test('turni ricorrenti: giorni scelti, un solo avviso, annullabili insieme', async () => {
  const { api, col, notes } = setup();
  await assert.rejects(api.createShiftSeries('anna', { structureId: 'lido', userId: 'bob', startDate: day(1), endDate: day(20), weekdays: [0], shiftTime: '09:00–12:00' }), /amministratori/);
  await assert.rejects(api.createShiftSeries('lido', { structureId: 'lido', userId: 'dario', startDate: day(1), endDate: day(20), weekdays: [0], shiftTime: '09:00–12:00' }), /staff/);
  await assert.rejects(api.createShiftSeries('lido', { structureId: 'lido', userId: 'anna', startDate: day(1), endDate: day(20), weekdays: [], shiftTime: '09:00–12:00' }), /giorno/);
  const { created, seriesId } = await api.createShiftSeries('lido', { structureId: 'lido', userId: 'anna', startDate: day(1), endDate: day(28), weekdays: [0, 2], shiftTime: '09:00–12:00' });
  assert.ok(created.length >= 7 && created.length <= 9, `circa 8 turni (lun e mer per 4 settimane), sono ${created.length}`);
  assert.ok(created.every((s) => s.seriesId === seriesId && [0, 2].includes((new Date(`${s.date}T12:00:00Z`).getUTCDay() + 6) % 7)));
  assert.equal(notes('anna').length, 1, 'un solo avviso per tutta la serie');
  const third = created[2];
  const res = await api.deleteShift('lido', { shiftId: third.$id, scope: 'series' });
  assert.equal(res.deleted, created.length - 2, 'annullati questo e i successivi');
  assert.equal(Object.values(col('shifts')).length, 2);
});

test('modelli settimanali: salvati, applicati senza doppioni', async () => {
  const { api, col, notes } = setup();
  await assert.rejects(api.saveShiftTemplate('lido', { structureId: 'lido', name: 'Settimana', slots: [{ weekday: 0, shiftTime: '09:00–12:00', userId: 'dario' }] }), /staff/);
  const t = await api.saveShiftTemplate('lido', { structureId: 'lido', name: 'Settimana tipo', slots: [
    { weekday: 0, shiftTime: '07:00–13:00', userId: 'anna' },
    { weekday: 0, shiftTime: '13:00–19:00', userId: 'bob' },
    { weekday: 4, shiftTime: '16:00–20:00', userId: 'anna', role: 'Istruttrice' },
  ] });
  assert.equal((await api.listShiftTemplates('lido', { structureId: 'lido' })).length, 1);
  await assert.rejects(api.listShiftTemplates('anna', { structureId: 'lido' }), /amministratori/);
  await assert.rejects(api.applyShiftTemplate('lido', { templateId: t.$id, weekStart: day(2) === monday() ? day(3) : day(2) }), /lunedì/);
  const r1 = await api.applyShiftTemplate('lido', { templateId: t.$id, weekStart: monday() });
  assert.equal(r1.created.length, 3);
  assert.equal(notes('anna').length, 1, 'un avviso per persona');
  const r2 = await api.applyShiftTemplate('lido', { templateId: t.$id, weekStart: monday() });
  assert.equal(r2.created.length, 0, 'applicato due volte: niente doppioni');
  assert.equal(r2.skipped, 3);
  assert.equal(Object.values(col('shifts')).length, 3);
});

test('scambi: diretto, aperto a tutti, annullato', async () => {
  const { api, col, notes } = setup();
  const shift = await api.createShift('lido', { structureId: 'lido', userId: 'anna', date: day(3), shiftTime: '09:00–12:00' });
  await assert.rejects(api.proposeShiftSwap('bob', { shiftId: shift.$id }), /tuoi turni/);
  await assert.rejects(api.proposeShiftSwap('anna', { shiftId: shift.$id, toUserId: 'dario' }), /collega/);
  // Diretto a Bob: Carla non può prenderlo, Bob accetta e il turno passa a lui confermato.
  const swap = await api.proposeShiftSwap('anna', { shiftId: shift.$id, toUserId: 'bob', message: 'Ho una visita medica' });
  await assert.rejects(api.proposeShiftSwap('anna', { shiftId: shift.$id }), /già chiesto/);
  await assert.rejects(api.respondShiftSwap('carla', { swapId: swap.$id, accept: true }), /altro collega/);
  const mine = await api.listMySwaps('bob');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].shift.shiftTime, '09:00–12:00');
  await api.respondShiftSwap('bob', { swapId: swap.$id, accept: true });
  assert.equal(col('shifts')[shift.$id].userId, 'bob');
  assert.equal(col('shifts')[shift.$id].status, 'confirmed');
  assert.ok(notes('lido').some((n) => /Cambio turno/.test(n.content)), 'la struttura è avvisata');
  // Aperto a tutti: il primo che accetta lo prende; chi rifiuta non lo chiude per gli altri.
  const s2 = await api.createShift('lido', { structureId: 'lido', userId: 'anna', date: day(4), shiftTime: '14:00–18:00' });
  const open = await api.proposeShiftSwap('anna', { shiftId: s2.$id });
  assert.ok(notes('carla').some((n) => /cerca qualcuno/.test(n.content)));
  await api.respondShiftSwap('bob', { swapId: open.$id, accept: false });
  assert.equal(col('shift_swaps')[open.$id].status, 'pending');
  await api.respondShiftSwap('carla', { swapId: open.$id, accept: true });
  assert.equal(col('shifts')[s2.$id].userId, 'carla');
  await assert.rejects(api.respondShiftSwap('bob', { swapId: open.$id, accept: true }), /non è più valida/);
  // Annullato da chi l'ha chiesto; un turno cancellato annulla le richieste.
  const s3 = await api.createShift('lido', { structureId: 'lido', userId: 'anna', date: day(5), shiftTime: '08:00–10:00' });
  const w3 = await api.proposeShiftSwap('anna', { shiftId: s3.$id });
  await assert.rejects(api.cancelShiftSwap('bob', { swapId: w3.$id }), /tue richieste/);
  await api.deleteShift('lido', { shiftId: s3.$id });
  assert.equal(col('shift_swaps')[w3.$id].status, 'cancelled');
});
