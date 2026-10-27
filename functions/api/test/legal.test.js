/** Conservazione su ordine dell'autorità (copie sigillate) e registro degli accessi dello staff. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createApi } from '../src/main.js';
import { makeSealer, openSealed, sha256 } from '../src/seal.js';
import { describeParams, isAudited } from '../src/audit.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });

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
        if (q.method === 'lessThan') rows = rows.filter((d) => String(d[q.attribute]) < String(q.values[0]));
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

const accounts = {
  boss: { $id: 'boss', name: 'Boss', email: 'boss@swimin.it', labels: ['admin'] },
  legale: { $id: 'legale', name: 'Legale', email: 'legale@swimin.it', labels: ['admin', 'legal'] },
  anna: { $id: 'anna', name: 'Anna', email: 'anna@esempio.it', labels: [] },
  luca: { $id: 'luca', name: 'Luca', email: 'luca@esempio.it', labels: [] },
};
const users = {
  get: async ({ userId }) => accounts[userId] ?? (() => { throw new Error('nf'); })(),
  list: async () => ({ users: Object.values(accounts) }),
  listLogs: async () => ({ logs: [{ event: 'session.create', ip: '93.40.1.2', time: '2026-10-01T10:00:00Z', countryName: 'Italia' }] }),
  listSessions: async () => ({ sessions: [] }),
  delete: async () => {},
};

const today = () => new Date().toISOString().slice(0, 10);

const seed = (col) => {
  col('profiles').anna = { $id: 'anna', userType: 'professional', firstName: 'Anna', lastName: 'Rossi' };
  col('profiles').luca = { $id: 'luca', userType: 'professional', firstName: 'Luca', lastName: 'Bianchi' };
  col('private_info').anna = { $id: 'anna', phone: '3331234567' };
  col('messages').m1 = { $id: 'm1', $createdAt: '2026-10-01T10:00:00Z', senderId: 'anna', receiverId: 'luca', conversationId: 'anna_luca', content: 'Ci vediamo in vasca alle 7' };
  col('messages').m2 = { $id: 'm2', $createdAt: '2026-10-01T10:05:00Z', senderId: 'luca', receiverId: 'anna', conversationId: 'anna_luca', content: 'Perfetto' };
  col('messages').m3 = { $id: 'm3', $createdAt: '2026-10-02T09:00:00Z', senderId: 'luca', receiverId: 'boss', conversationId: 'boss_luca', content: 'Altro' };
};

const order = (extra = {}) => ({ subjectType: 'user', userId: 'anna', authority: 'Procura della Repubblica di Milano', reference: 'RGNR 1234/2026', orderDate: today(), days: 90, reason: 'Ordine di conservazione ricevuto via PEC', ...extra });

test('copia sigillata: si apre solo con la chiave privata e l\'impronta corrisponde', () => {
  const sealer = makeSealer(PUB);
  const { sealed, hash } = sealer.seal({ a: 'testo riservato' });
  assert.ok(!sealed.includes('testo riservato'));
  assert.equal(hash, sha256(sealed));
  assert.deepEqual(openSealed(sealed, privateKey), { a: 'testo riservato' });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.throws(() => openSealed(sealed, other));
  assert.equal(makeSealer(''), null);
  assert.equal(makeSealer('non è una chiave'), null);
  // La chiave nelle variabili d'ambiente può arrivare con "\n" letterali.
  assert.ok(makeSealer(PUB.replace(/\n/g, '\\n')));
});

test('solo il responsabile legale (admin + legal) registra un ordine; senza chiave 503', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  await assert.rejects(api.legalCreateHold('boss', order()), (e) => e.status === 403);
  await assert.rejects(api.legalCreateHold('anna', order()), (e) => e.status === 403);
  await assert.rejects(api.legalListHolds('boss'), (e) => e.status === 403);
  const noKey = createApi(db, { users });
  await assert.rejects(noKey.legalCreateHold('legale', order()), (e) => e.status === 503);
  await assert.rejects(api.legalCreateHold('legale', order({ reason: '' })), (e) => e.status === 400);
  await assert.rejects(api.legalCreateHold('legale', order({ orderDate: '2999-01-01' })), (e) => e.status === 400);
  await assert.rejects(api.legalCreateHold('legale', order({ days: 7 })), (e) => e.status === 400);
  await assert.rejects(api.legalCreateHold('legale', order({ userId: 'nessuno' })), (e) => e.status === 404);
});

test('ordine su una persona: copia sigillata di account, accessi, profilo e messaggi; esportazione con impronte', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  const hold = await api.legalCreateHold('legale', order());
  assert.equal(hold.status, 'active');
  assert.ok(hold.items >= 5);
  const items = Object.values(col('held_items'));
  for (const i of items) {
    assert.deepEqual(i.$permissions, []);
    assert.ok(!i.sealed.includes('vasca'), 'nel database solo testo cifrato');
    assert.equal(i.hash, sha256(i.sealed));
  }
  const kinds = items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['account', 'accessi', 'dati_privati', 'messaggi', 'profilo'].sort());
  const msgs = openSealed(items.find((i) => i.kind === 'messaggi').sealed, privateKey);
  assert.deepEqual(msgs.data.map((m) => m.$id), ['m1', 'm2']);
  assert.equal(msgs.reference, 'RGNR 1234/2026');

  await assert.rejects(api.legalExportHold('legale', { holdId: hold.$id }), (e) => e.status === 400);
  const exp = await api.legalExportHold('legale', { holdId: hold.$id, reason: 'Consegna alla Procura, prot. 55' });
  assert.equal(exp.manifest.items.length, items.length);
  assert.equal(exp.nextOffset, null);
  for (const it of exp.items) {
    const m = exp.manifest.items.find((x) => x.id === it.id);
    assert.equal(sha256(it.sealed), m.sha256);
  }
  const list = await api.legalListHolds('legale');
  assert.equal(list[0].items, items.length);
});

test('ordine su una conversazione: solo i messaggi tra le due persone; eliminati dopo l\'ordine restano sigillati', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  const hold = await api.legalCreateHold('legale', order({ subjectType: 'conversation', otherUserId: 'luca' }));
  assert.equal(hold.subjectId, 'anna_luca');
  const before = Object.values(col('held_items')).length;
  assert.equal(before, 1);
  // Anna elimina "per tutti" un suo messaggio: il testo sparisce dalla chat ma resta nella copia sigillata.
  await api.deleteMessage('anna', { messageId: 'm1' });
  assert.equal(col('messages').m1.content, '');
  const deleted = Object.values(col('held_items')).find((i) => i.kind === 'messaggio_eliminato');
  assert.ok(deleted);
  assert.equal(openSealed(deleted.sealed, privateKey).data.content, 'Ci vediamo in vasca alle 7');
  // Messaggi di altre conversazioni: nessuna copia.
  col('messages').m4 = { $id: 'm4', senderId: 'luca', receiverId: 'boss', conversationId: 'boss_luca', content: 'x' };
  await api.deleteMessage('luca', { messageId: 'm4' });
  assert.equal(Object.values(col('held_items')).length, 2);
});

test('rilascio e scadenza: le copie sigillate si cancellano', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  const a = await api.legalCreateHold('legale', order());
  const b = await api.legalCreateHold('legale', order({ subjectType: 'conversation', otherUserId: 'luca', reference: 'RGNR 99/2026' }));
  const ext = await api.legalExtendHold('legale', { holdId: b.$id, days: 30, refresh: true, reason: 'Proroga richiesta dall\'autorità' });
  assert.equal(ext.added, 1);
  await assert.rejects(api.legalReleaseHold('legale', { holdId: a.$id }), (e) => e.status === 400);
  const rel = await api.legalReleaseHold('legale', { holdId: a.$id, reason: 'Procedimento archiviato' });
  assert.ok(rel.removed >= 5);
  assert.equal(col('legal_holds')[a.$id].status, 'released');
  assert.equal(Object.values(col('held_items')).filter((i) => i.holdId === a.$id).length, 0);
  await assert.rejects(api.legalExtendHold('legale', { holdId: a.$id, days: 30, reason: 'Proroga di prova' }), (e) => e.status === 409);
  // Scadenza: la pulizia notturna cancella le copie.
  col('legal_holds')[b.$id].until = '2020-01-01';
  const out = await api._nightlyCleanup();
  assert.equal(out.conservazioniScadute, 2);
  assert.equal(col('legal_holds')[b.$id].status, 'expired');
  assert.equal(Object.values(col('held_items')).length, 0);
});

test('account eliminato sotto conservazione: copia completa prima della cancellazione', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  await api.legalCreateHold('legale', order());
  const before = Object.values(col('held_items')).length;
  await api.deleteAccount('anna', { confirmation: 'ELIMINA' }).catch(async (e) => {
    // La frase di conferma è definita nella Function: la si legge dall'errore.
    const word = /scrivi (\S+)\./.exec(e.message)?.[1];
    await api.deleteAccount('anna', { confirmation: word });
  });
  assert.equal(col('private_info').anna, undefined);
  assert.ok(Object.values(col('held_items')).length >= before * 2 - 1);
});

test('registro degli accessi: azioni admin e legal registrate, anche se negate; legal visibili solo al responsabile', async () => {
  const { db, col } = makeDb();
  seed(col);
  const api = createApi(db, { users, escrowPublicKey: PUB });
  await api.legalCreateHold('legale', order());
  await assert.rejects(api.legalListHolds('boss'), (e) => e.status === 403);
  await assert.rejects(api.adminListAudit('anna'), (e) => e.status === 403);
  const rows = Object.values(col('audit_log'));
  const create = rows.find((r) => r.action === 'legalCreateHold');
  assert.equal(create.outcome, 'ok');
  assert.equal(create.scope, 'legal');
  assert.equal(create.targetType, 'user');
  assert.equal(create.targetId, 'anna');
  assert.equal(create.reason, 'Ordine di conservazione ricevuto via PEC');
  assert.equal(rows.find((r) => r.action === 'legalListHolds').outcome, 'denied');
  assert.equal(rows.find((r) => r.action === 'adminListAudit').outcome, 'denied');
  for (const r of rows) assert.deepEqual(r.$permissions, []);

  const forBoss = await api.adminListAudit('boss');
  assert.ok(forBoss.every((r) => r.scope === 'admin'));
  const forLegal = await api.adminListAudit('legale');
  assert.ok(forLegal.some((r) => r.action === 'legalCreateHold'));
  assert.ok(forLegal.find((r) => r.action === 'legalCreateHold').actorName);
});

test('registro: niente contenuti nei parametri registrati', () => {
  assert.equal(isAudited('adminSetAppStatus'), true);
  assert.equal(isAudited('legalExportHold'), true);
  assert.equal(isAudited('adminOverview'), false);
  assert.equal(isAudited('administer'), false);
  assert.equal(isAudited('sendMessage'), false);
  const d = describeParams({ userId: 'u1', message: 'segreto', note: 'nota', days: 30, mode: 'maintenance', list: [1, 2] });
  assert.equal(d.targetType, 'user');
  assert.equal(d.targetId, 'u1');
  assert.ok(!d.meta.includes('segreto') && !d.meta.includes('nota'));
  assert.deepEqual(JSON.parse(d.meta), { days: 30, mode: 'maintenance' });
});
