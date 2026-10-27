/** Promemoria della sera prima, suggerimenti dall'app ed esportazione dei turni. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { romeTomorrow } from '../src/reminders.js';

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
const users = {
  get: async ({ userId }) => ({ $id: userId, email: `${userId}@esempio.it`, labels: userId === 'boss' ? ['admin'] : [] }),
  list: async () => ({ users: [{ $id: 'boss', labels: ['admin'] }] }),
  delete: async () => {},
};

test('ora e data di domani in Italia', () => {
  // 30 ottobre 2026, 17:30 UTC = 18:30 in Italia (ora solare dal 25 ottobre).
  assert.deepEqual(romeTomorrow(Date.parse('2026-10-30T17:30:00Z')), { hour: 18, tomorrow: '2026-10-31' });
  // 23:30 UTC del 31 = 00:30 del 1° novembre in Italia: domani è il 2.
  assert.deepEqual(romeTomorrow(Date.parse('2026-10-31T23:30:00Z')), { hour: 0, tomorrow: '2026-11-02' });
});

test('promemoria di turni e colloqui: dalle 18, una volta sola', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  const now = Date.parse('2026-11-03T18:10:00Z'); // 19:10 in Italia
  const evening = Date.parse('2026-11-03T15:00:00Z'); // 16:00 in Italia
  const put = (t, id, d) => (col(t)[id] = { $id: id, ...d });
  put('profiles', 'lido', { userType: 'structure', structureName: 'Piscina Lido' });
  put('profiles', 'anna', { userType: 'professional', firstName: 'Anna', lastName: 'Rossi' });
  put('shifts', 's1', { structureId: 'lido', userId: 'anna', date: '2026-11-04', shiftTime: '09:00–13:00', status: 'confirmed' });
  put('shifts', 's2', { structureId: 'lido', userId: 'anna', date: '2026-11-04', shiftTime: '15:00–18:00', status: 'scheduled' });
  put('shifts', 's3', { structureId: 'lido', userId: 'anna', date: '2026-11-04', shiftTime: '19:00–21:00', status: 'declined' });
  put('shifts', 's4', { structureId: 'lido', userId: 'anna', date: '2026-11-05', shiftTime: '09:00–13:00', status: 'confirmed' });
  put('jobs', 'j1', { structureId: 'lido', structureName: 'Piscina Lido', title: 'Istruttore' });
  put('applications', 'a1', { jobId: 'j1', applicantId: 'anna', status: 'accepted', interviewDate: '2026-11-04', interviewTime: '10:30', interviewMode: 'presenza', interviewPlace: 'Reception', interviewStatus: 'accepted' });
  put('applications', 'a2', { jobId: 'j1', applicantId: 'anna', status: 'accepted', interviewDate: '2026-11-04', interviewTime: '11:00', interviewMode: 'video', interviewStatus: 'proposed' });
  const notes = (u) => Object.values(col('notifications')).filter((n) => n.userId === u).map((n) => n.content);

  assert.deepEqual(await api._sendReminders({ now: evening }), { shifts: 0, interviews: 0, skipped: true });
  assert.deepEqual(await api._sendReminders({ now }), { shifts: 2, interviews: 1 });
  assert.ok(notes('anna').includes('Domani hai il turno 09:00–13:00 presso Piscina Lido.'));
  assert.ok(notes('anna').includes('Domani hai il turno 15:00–18:00 presso Piscina Lido: ricordati di confermarlo.'));
  assert.ok(notes('anna').includes('Domani alle 10:30 hai il colloquio con Piscina Lido per "Istruttore" (Reception).'));
  assert.ok(notes('lido').includes('Domani alle 10:30 colloquio con Anna Rossi per "Istruttore".'));
  assert.ok(col('shifts').s1.reminderSentAt && !col('shifts').s3.reminderSentAt && !col('shifts').s4.reminderSentAt);
  // Seconda esecuzione nella stessa sera: niente doppioni.
  assert.deepEqual(await api._sendReminders({ now: now + 3_600_000 }), { shifts: 0, interviews: 0 });
});

test('suggerimenti dall’app: inviati, limitati e gestiti dagli amministratori', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  col('profiles').anna = { $id: 'anna', userType: 'professional', firstName: 'Anna', lastName: 'Rossi' };
  await assert.rejects(api.sendFeedback('anna', { kind: 'idea', message: 'corto' }), /10 caratteri/);
  await assert.rejects(api.sendFeedback('anna', { kind: 'reclamo', message: 'Un messaggio abbastanza lungo' }), /Tipo/);
  const sent = await api.sendFeedback('anna', { kind: 'problema', message: 'Il calendario dei turni non si apre su iPhone.', page: '/turni', userAgent: 'iPhone' });
  assert.equal(sent.ok, true);
  const row = col('feedback')[sent.id];
  assert.deepEqual([row.kind, row.page, row.status, row.$permissions.length], ['problema', '/turni', 'open', 0]);
  const alert = Object.values(col('notifications')).find((n) => n.userId === 'boss');
  assert.equal(alert.type, 'feedback');
  assert.match(alert.content, /^problema da Anna Rossi: Il calendario/);
  for (let i = 0; i < 4; i++) await api.sendFeedback('anna', { message: `Suggerimento numero ${i} per SwimIn` });
  await assert.rejects(api.sendFeedback('anna', { message: 'Ancora un suggerimento' }), /5 messaggi/);

  await assert.rejects(api.adminListFeedback('anna'), /amministratori/);
  const open = await api.adminListFeedback('boss', { status: 'open' });
  assert.equal(open.length, 5);
  assert.equal(open[0].name, 'Anna Rossi');
  await api.adminSetFeedbackStatus('boss', { feedbackId: sent.id, status: 'done' });
  assert.equal((await api.adminListFeedback('boss', { status: 'done' })).length, 1);
  await assert.rejects(api.adminSetFeedbackStatus('anna', { feedbackId: sent.id, status: 'open' }), /amministratori/);
});

test('esportazione dei turni del mese: solo amministratori, con le ore', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  col('profiles').lido = { $id: 'lido', userType: 'structure', structureName: 'Piscina Lido', staff: ['anna', 'bob'] };
  col('profiles').anna = { $id: 'anna', userType: 'professional', firstName: 'Anna' };
  const put = (id, d) => (col('shifts')[id] = { $id: id, structureId: 'lido', role: 'Istruttore', ...d });
  put('s1', { userId: 'anna', userName: 'Anna Rossi', date: '2026-11-04', shiftTime: '09:00–13:30', status: 'confirmed' });
  put('s2', { userId: 'bob', userName: 'Bob Bianchi', date: '2026-11-02', shiftTime: '15:00–18:00', status: 'scheduled' });
  put('s3', { userId: 'anna', userName: 'Anna Rossi', date: '2026-12-01', shiftTime: '09:00–13:00', status: 'confirmed' });
  const out = await api.exportShifts('lido', { structureId: 'lido', month: '2026-11' });
  assert.equal(out.structureName, 'Piscina Lido');
  assert.deepEqual(out.shifts.map((s) => [s.date, s.userName, s.hours]), [['2026-11-02', 'Bob Bianchi', 3], ['2026-11-04', 'Anna Rossi', 4.5]]);
  await assert.rejects(api.exportShifts('anna', { structureId: 'lido', month: '2026-11' }));
  await assert.rejects(api.exportShifts('lido', { structureId: 'lido', month: '2026-13' }), /Mese/);
});
