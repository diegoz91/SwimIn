/** Fase di test chiusa: iscrizione con invito, condizioni accettate, gestione degli inviti. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { normalizeCode } from '../src/beta.js';

const makeDb = () => {
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
  return { db, col };
};
const accounts = {
  boss: { $id: 'boss', email: 'boss@swimin.it', labels: ['admin'] },
  prova: { $id: 'prova', email: 'swimin-e2e+r1-candidata@example.com', labels: [] },
};
const users = { get: async ({ userId }) => accounts[userId] ?? { $id: userId, email: `${userId}@esempio.it`, labels: [] } };
const person = (extra = {}) => ({ userType: 'professional', personType: 'professional', firstName: 'Anna', lastName: 'Rossi', acceptedTerms: true, termsVersion: 'v', betaAccepted: true, betaVersion: '2026-10-28', ...extra });

test('codici leggibili: maiuscole, niente simboli', () => {
  assert.equal(normalizeCode(' ab-cd 23ef '), 'ABCD23EF');
});

test('iscrizione su invito: senza codice no, con codice sì, usi contati, codice nei dati privati', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  await assert.rejects(api.adminCreateInvite('anna', { label: 'x' }), (e) => e.status === 403);
  const inv = await api.adminCreateInvite('boss', { label: 'Piscina Lido, gruppo istruttori', maxUses: 2 });
  assert.match(inv.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.deepEqual(await api.checkInvite(null, { code: inv.code.toLowerCase() }), { valid: true, inviteOnly: true });
  assert.equal((await api.checkInvite(null, { code: 'NONVALE1' })).valid, false);

  await assert.rejects(api.initProfile('anna', person()), (e) => e.status === 403 && e.code === 'invite_required');
  await assert.rejects(api.initProfile('anna', person({ inviteCode: inv.code, betaAccepted: false })), (e) => e.status === 400);
  await api.initProfile('anna', person({ inviteCode: inv.code }));
  assert.equal(col('private_info').anna.inviteCode, inv.code);
  assert.ok(col('private_info').anna.betaAcceptedAt);
  assert.equal(col('private_info').anna.betaVersion, '2026-10-28');
  assert.equal(col('profiles').anna.inviteCode, undefined, 'il codice non va sul profilo pubblico');
  await api.initProfile('luca', person({ firstName: 'Luca', inviteCode: inv.code }));
  // Usi finiti.
  await assert.rejects(api.initProfile('sara', person({ firstName: 'Sara', inviteCode: inv.code })), (e) => e.status === 403);
  const list = await api.adminListInvites('boss');
  assert.equal(list.invites[0].uses, 2);
  // Disattivato: non vale più.
  const inv2 = await api.adminCreateInvite('boss', { maxUses: 5 });
  await api.adminSetInviteActive('boss', { inviteId: inv2.$id, active: false });
  assert.equal((await api.checkInvite(null, { code: inv2.code })).valid, false);
  // Scaduto: non vale più.
  const inv3 = await api.adminCreateInvite('boss', { maxUses: 5, expiresAt: '2020-01-01' });
  assert.equal((await api.checkInvite(null, { code: inv3.code })).valid, false);
});

test('account della prova automatica senza codice; iscrizione aperta senza codice; chi c\'era accetta le condizioni', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users });
  await api.initProfile('prova', person());
  assert.ok(col('profiles').prova);
  await api.adminSetInviteOnly('boss', { enabled: false });
  assert.equal(col('app_status').main.inviteOnly, false);
  assert.equal((await api._appStatus()).inviteOnly, false);
  await api.initProfile('libero', person({ firstName: 'Libero' }));
  assert.equal(col('private_info').libero.inviteCode, undefined);
  await api.acceptBeta('vecchio', { version: '2026-10-28' });
  assert.equal(col('private_info').vecchio.betaVersion, '2026-10-28');
  // Azioni amministrative nel registro degli accessi.
  assert.ok(Object.values(col('audit_log')).some((r) => r.action === 'adminSetInviteOnly' && r.outcome === 'ok'));
});
