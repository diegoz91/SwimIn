/**
 * Conformità: recesso da Premium (Codice del Consumo art. 54-bis), provvedimenti motivati
 * (Digital Services Act art. 17) e registro delle violazioni dei dati (GDPR art. 33).
 * Stripe, PayPal, email e utenti sono finti.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { proratedRefund, WITHDRAWAL_DAYS } from '../src/billing.js';
import { MODERATION_GROUNDS, statementOfReasons } from '../src/moderation.js';
import { garanteDeadline } from '../src/breaches.js';

const DAY = 86_400_000;
const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  let seq = 0;
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25; let after = null;
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute]));
        if (q.method === 'limit') lim = q.values[0];
        if (q.method === 'cursorAfter') after = q.values[0];
      }
      const total = rows.length;
      if (after) rows = rows.slice(rows.findIndex((r) => r.$id === after) + 1);
      return { total, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) {
      const id = rowId && rowId !== 'unique()' ? rowId : `id${++seq}`;
      const d = { $id: id, $createdAt: new Date().toISOString(), $updatedAt: new Date().toISOString(), $permissions: permissions || [], ...data };
      col(tableId)[id] = d; return structuredClone(d);
    },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data, { $updatedAt: new Date().toISOString() }); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};
const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };
const users = {
  get: async ({ userId }) => ({ email: `${userId}@esempio.it`, labels: userId === 'boss' ? ['admin'] : [] }),
  updateStatus: async () => {}, delete: async () => {},
};

test('quota del rimborso: parte di periodo non goduta, mai negativa', () => {
  const start = 0; const end = 30 * DAY;
  assert.equal(proratedRefund(499, start, end, 3 * DAY), Math.round(499 * 27 / 30));
  assert.equal(proratedRefund(499, start, end, 40 * DAY), 0);
  assert.equal(proratedRefund(499, start, end, -5 * DAY), 499, 'mai più del pagato');
  assert.equal(proratedRefund(0, start, end, DAY), 0);
  assert.equal(WITHDRAWAL_DAYS, 14);
});

test('recesso da Premium: due passaggi, disdetta, rimborso e ricevuta', async () => {
  const { db, col } = makeDb();
  const calls = [];
  const emails = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.includes('/subscriptions/sub_1') && init.method === 'DELETE') return json({ id: 'sub_1', status: 'canceled' });
    if (url.includes('/invoices?subscription=sub_1')) return json({ data: [{ amount_paid: 499, payment_intent: 'pi_1' }] });
    if (url.endsWith('/refunds')) return json({ id: 're_1' });
    return json({ error: { message: 'non previsto' } }, 404);
  };
  const messaging = { createEmail: async (m) => { emails.push(m); return { $id: 'm1' }; } };
  const api = createApi(db, { users, fetchImpl, messaging, billing: { stripe: { secretKey: 'sk_test' } }, appUrl: 'https://swimin.it' });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { premiumUntil: new Date(Date.now() + 27 * DAY).toISOString(), premiumSource: 'stripe' });
  P('bob');
  const end = new Date(Date.now() + 27 * DAY).toISOString();
  col('subscriptions').s1 = { $id: 's1', $createdAt: new Date(Date.now() - 3 * DAY).toISOString(), userId: 'anna', provider: 'stripe', externalId: 'sub_1', customerId: 'cus_1', status: 'active', period: 'month', audience: 'person', currentPeriodEnd: end };

  // Primo passaggio: il contratto è già identificato (utente autenticato, niente dati da reinserire).
  const w = await api.getWithdrawal('anna');
  assert.equal(w.available, true);
  assert.equal(w.contract.id, 's1');
  assert.equal(Date.parse(w.contract.deadline), Date.parse(col('subscriptions').s1.$createdAt) + 14 * DAY);
  assert.equal((await api.getWithdrawal('bob')).available, false);

  // Secondo passaggio: senza conferma esplicita o con un contratto altrui non succede nulla.
  await rejects(api.withdrawSubscription('anna', { contractId: 's1' }), 400);
  await rejects(api.withdrawSubscription('bob', { contractId: 's1', confirm: true }), 409);
  assert.equal(calls.length, 0);

  const r = await api.withdrawSubscription('anna', { contractId: 's1', confirm: true });
  assert.equal(r.refundStatus, 'refunded');
  assert.ok(r.refundAmount > 0 && r.refundAmount <= 499);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('/subscriptions/sub_1')), 'abbonamento disdetto subito');
  const refundCall = calls.find((c) => c.url.endsWith('/refunds'));
  assert.equal(new URLSearchParams(refundCall.body).get('payment_intent'), 'pi_1');
  assert.equal(Number(new URLSearchParams(refundCall.body).get('amount')), r.refundAmount);
  // Premium chiuso e abbonamento annullato.
  assert.ok(Date.parse(col('profiles').anna.premiumUntil) <= Date.now());
  assert.equal(col('subscriptions').s1.status, 'canceled');
  // Ricevuta su supporto durevole: email con dichiarazione, data e ora.
  const receipt = emails.filter((m) => m.subject === 'Ricevuta del recesso da SwimIn Premium');
  assert.equal(receipt.length, 1);
  assert.deepEqual(receipt[0].users, ['anna']);
  assert.equal(receipt[0].html, false);
  assert.match(receipt[0].content, /recedo dal contratto/);
  assert.match(receipt[0].content, /Recesso ricevuto il/);
  assert.equal(r.emailed, true);
  // Registrato una volta sola: non si può recedere due volte.
  assert.equal(col('withdrawals').s1.refundStatus, 'refunded');
  await rejects(api.withdrawSubscription('anna', { contractId: 's1', confirm: true }), 409);
  const after = await api.getWithdrawal('anna');
  assert.equal(after.available, false);
  assert.equal(after.receipts.length, 1);

  // Oltre i 14 giorni il recesso non è più disponibile.
  P('carla', { premiumUntil: end });
  col('subscriptions').s2 = { $id: 's2', $createdAt: new Date(Date.now() - 15 * DAY).toISOString(), userId: 'carla', provider: 'stripe', externalId: 'sub_2', status: 'active', period: 'month', currentPeriodEnd: end };
  assert.equal((await api.getWithdrawal('carla')).available, false);
});

test('recesso: se il rimborso non riesce resta da fare a mano e gli admin vengono avvisati', async () => {
  const { db, col } = makeDb();
  const fetchImpl = async (url, init = {}) => {
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (init.method === 'DELETE') return json({ id: 'sub_9', status: 'canceled' });
    return json({ error: { message: 'giù' } }, 500);
  };
  const api = createApi(db, { users, fetchImpl, billing: { stripe: { secretKey: 'sk_test' } }, alertUserIds: ['boss'] });
  col('profiles').dora = { $id: 'dora', userId: 'dora', userType: 'professional', firstName: 'Dora', connections: [], premiumUntil: new Date(Date.now() + 20 * DAY).toISOString() };
  col('profiles').boss = { $id: 'boss', userId: 'boss', userType: 'professional', firstName: 'Boss', connections: [] };
  col('subscriptions').s9 = { $id: 's9', $createdAt: new Date(Date.now() - DAY).toISOString(), userId: 'dora', provider: 'stripe', externalId: 'sub_9', status: 'active', period: 'month', currentPeriodEnd: new Date(Date.now() + 29 * DAY).toISOString() };
  const r = await api.withdrawSubscription('dora', { contractId: 's9', confirm: true });
  assert.equal(r.refundStatus, 'manual');
  assert.equal(r.emailed, false, 'senza email attive la ricevuta resta nell’app');
  assert.equal(col('withdrawals').s9.refundStatus, 'manual');
  assert.ok(Object.values(col('notifications')).some((n) => n.userId === 'dora' && /Recesso ricevuto/.test(n.content)));
});

test('provvedimenti motivati: regola, motivazione, esito a chi segnala', async () => {
  const { db, col } = makeDb();
  const emails = [];
  const messaging = { createEmail: async (m) => { emails.push(m); return { $id: 'm' }; } };
  const api = createApi(db, { users, messaging });
  const P = (id) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [] });
  P('boss'); P('eve'); P('rita'); P('ugo');
  col('posts').p1 = { $id: 'p1', authorId: 'eve', content: 'Compra follower qui!!!', likesCount: 0, commentsCount: 0 };
  await api.reportContent('rita', { targetType: 'post', targetId: 'p1', reason: 'spam' });
  await api.reportContent('ugo', { targetType: 'post', targetId: 'p1', reason: 'altro' });
  const [rep] = Object.values(col('reports'));

  await rejects(api.adminResolveReport('eve', { reportId: rep.$id, decision: 'remove' }), 403);
  await rejects(api.adminResolveReport('boss', { reportId: rep.$id, decision: 'remove', ground: 'inventata' }), 400);
  const res = await api.adminResolveReport('boss', { reportId: rep.$id, decision: 'remove', explanation: 'Pubblicità ripetuta di servizi a pagamento.' });
  assert.equal(res.closed, 2);
  assert.equal(col('posts').p1, undefined);
  // Regola proposta dal motivo segnalato; salvata sulla segnalazione.
  assert.equal(col('reports')[rep.$id].ground, 'spam');

  // L'autore riceve la notifica con la decisione e l'email con la motivazione completa.
  const n = Object.values(col('notifications')).find((x) => x.userId === 'eve' && x.type === 'moderation');
  assert.equal(n.relatedId, res.decisionId);
  assert.match(n.content, /Spam/);
  const statement = emails.filter((m) => m.html === false);
  assert.equal(statement.length, 1);
  assert.deepEqual(statement[0].users, ['eve']);
  assert.match(statement[0].content, /Regola violata: Spam/);
  assert.match(statement[0].content, /Compra follower/);
  assert.match(statement[0].content, /Pubblicità ripetuta/);
  assert.match(statement[0].content, /non da un sistema automatico/);
  assert.match(statement[0].content, /contestarla/);

  // La decisione la vede solo chi l'ha ricevuta.
  const d = await api.getModerationDecision('eve', { decisionId: res.decisionId });
  assert.deepEqual([d.action, d.ground, d.groundLabel, d.automated], ['remove', 'spam', MODERATION_GROUNDS.spam, false]);
  await rejects(api.getModerationDecision('rita', { decisionId: res.decisionId }), 404);

  // Chi ha segnalato sa com'è finita, una volta per persona.
  for (const id of ['rita', 'ugo']) {
    const got = Object.values(col('notifications')).filter((x) => x.userId === id && /segnalazione/.test(x.content));
    assert.equal(got.length, 1, id);
    assert.match(got[0].content, /preso provvedimenti/);
  }

  // Archiviazione: nessuna decisione, chi segnala viene avvisato.
  col('posts').p2 = { $id: 'p2', authorId: 'eve', content: 'Allenamento di oggi', likesCount: 0, commentsCount: 0 };
  await api.reportContent('rita', { targetType: 'post', targetId: 'p2', reason: 'molestie' });
  const rep2 = Object.values(col('reports')).find((r) => r.targetId === 'p2');
  const dismissed = await api.adminResolveReport('boss', { reportId: rep2.$id, decision: 'dismiss' });
  assert.equal(dismissed.decisionId, null);
  assert.ok(Object.values(col('notifications')).some((x) => x.userId === 'rita' && /non abbiamo trovato violazioni/.test(x.content)));
});

test('motivazione: testo completo per la sospensione', () => {
  const text = statementOfReasons({ action: 'suspend', ground: 'falso_profilo', targetType: 'profile', excerpt: '', explanation: '', decidedAt: '2026-10-28T10:00:00Z' });
  assert.match(text, /account SwimIn è stato sospeso/);
  assert.match(text, /Profilo falso/);
  assert.match(text, /autorità giudiziaria/);
});

test('registro delle violazioni dei dati: 72 ore per il Garante', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users, alertUserIds: ['boss'] });
  col('profiles').boss = { $id: 'boss', userId: 'boss', userType: 'professional', firstName: 'Boss', connections: [] };
  const detectedAt = new Date(Date.now() - 80 * 3_600_000).toISOString();
  await rejects(api.adminListBreaches('eve'), 403);
  await rejects(api.adminSaveBreach('boss', { title: 'x', description: 'y', risk: 'enorme', detectedAt }), 400);
  await rejects(api.adminSaveBreach('boss', { title: 'x', description: 'y', risk: 'low', detectedAt: new Date(Date.now() + DAY).toISOString() }), 400);

  const b = await api.adminSaveBreach('boss', { title: 'CV visibili per errore', description: 'Un link ai CV era accessibile senza accesso.', risk: 'high', detectedAt, affectedCount: 12, dataCategories: 'CV, nome' });
  assert.equal(b.required, true);
  assert.equal(b.overdue, true, 'oltre le 72 ore senza avviso al Garante');
  assert.ok(Object.values(col('notifications')).some((n) => n.userId === 'boss' && n.type === 'data_breach'), 'avviso agli amministratori');

  // Non si chiude senza gli avvisi dovuti.
  await rejects(api.adminSaveBreach('boss', { breachId: b.$id, title: b.title, description: b.description, risk: 'high', detectedAt, status: 'closed' }), 400);
  await rejects(api.adminSaveBreach('boss', { breachId: b.$id, title: b.title, description: b.description, risk: 'high', detectedAt, status: 'closed', garanteNotifiedAt: new Date().toISOString() }), 400);
  const closed = await api.adminSaveBreach('boss', { breachId: b.$id, title: b.title, description: b.description, risk: 'high', detectedAt, status: 'closed', garanteNotifiedAt: new Date().toISOString(), usersNotifiedAt: new Date().toISOString(), measures: 'Link revocato, permessi corretti.' });
  assert.deepEqual([closed.status, closed.overdue], ['closed', false]);
  assert.equal((await api.adminListBreaches('boss')).length, 1);

  // Rischio basso: si documenta, nessun avviso al Garante richiesto.
  assert.deepEqual(garanteDeadline({ detectedAt, risk: 'low' }).required, false);
});
