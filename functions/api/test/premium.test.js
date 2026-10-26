/**
 * Test di SwimIn Premium: prova, pagamenti (Stripe e PayPal finti), webhook firmati,
 * messaggi diretti, limiti del piano Base.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApi } from '../src/main.js';
import { verifyStripeSignature, INMAIL_CREDITS, BASE_ACTIVE_JOBS, BASE_STAFF } from '../src/billing.js';

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
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $updatedAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return d; },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data, { $updatedAt: new Date().toISOString() }); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};

const rejects = async (p, status, code) => {
  try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); if (code) assert.equal(e.code, code); }
};

test('firma dei webhook Stripe', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(body, `t=${t - 1000},v1=${crypto.createHmac('sha256', secret).update(`${t - 1000}.${body}`).digest('hex')}`, secret));
  assert.ok(!verifyStripeSignature(body, '', secret));
});

test('Premium: prova, messaggi diretti, limiti Base, pagamenti e webhook', async () => {
  const { db, col } = makeDb();
  const calls = [];
  const stripeSubs = {};
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.endsWith('/checkout/sessions')) return json({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    if (url.includes('/subscriptions/sub_')) return init.method === 'DELETE' ? json({ id: 'sub_1', status: 'canceled' }) : json(stripeSubs[url.split('/').pop()]);
    if (url.endsWith('/billing_portal/sessions')) return json({ url: 'https://billing.stripe.com/p/1' });
    if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'pp_token' });
    if (url.endsWith('/v1/billing/subscriptions') && init.method === 'POST') return json({ id: 'I-ABCDEF123', links: [{ rel: 'approve', href: 'https://www.paypal.com/approve/I-ABCDEF123' }] });
    if (url.includes('/v1/billing/subscriptions/I-ABCDEF123')) return json({ id: 'I-ABCDEF123', status: 'ACTIVE', custom_id: 'bob', plan_id: 'P-PM', billing_info: { next_billing_time: new Date(Date.now() + 30 * 86400000).toISOString() } });
    if (url.includes('/v1/prices?')) return json({ data: [{ id: 'price_pm', unit_amount: 499, product: 'prod_1' }] });
    if (url.endsWith('/v1/prices') && init.method === 'POST') return json({ id: `price_new_${new URLSearchParams(init.body).get('unit_amount')}` });
    if (url.includes('/v1/catalogs/products')) return json({ products: [{ id: 'PROD-1', name: 'SwimIn Premium' }] });
    if (url.endsWith('/v1/billing/plans') && init.method === 'POST') return json({ id: `P-NEW-${JSON.parse(init.body).billing_cycles[0].pricing_scheme.fixed_price.value}` });
    if (url.endsWith('/verify-webhook-signature')) return json({ verification_status: JSON.parse(init.body).transmission_sig === 'ok' ? 'SUCCESS' : 'FAILURE' });
    return json({ error: { message: 'non previsto' } }, 404);
  };
  const billing = {
    stripe: { secretKey: 'sk_test', webhookSecret: 'whsec_x', prices: { person_month: 'price_pm', person_year: 'price_py', structure_month: 'price_sm', structure_year: 'price_sy' } },
    paypal: { clientId: 'cid', secret: 'sec', webhookId: 'WH-1', mode: 'sandbox', plans: { person_month: 'P-PM', person_year: 'P-PY', structure_month: 'P-SM', structure_year: 'P-SY' } },
  };
  const users = { get: async ({ userId }) => ({ email: `${userId}@esempio.it`, labels: userId === 'boss' ? ['admin'] : [] }), delete: async () => {} };
  const api = createApi(db, { users, fetchImpl, billing, appUrl: 'https://swimin.it' });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna'); P('bob'); P('carla'); P('boss'); P('piscina', { userType: 'structure', structureName: 'Piscina Blu' });
  P('dario', { personType: 'enthusiast' });

  // Stato iniziale: Base, prova disponibile, entrambi i metodi di pagamento attivi.
  let st = await api.getBillingStatus('anna');
  assert.equal(st.premium, false); assert.equal(st.trialAvailable, true); assert.deepEqual(st.providers, { stripe: true, paypal: true });
  assert.deepEqual(st.prices, { month: 499, year: 4790 });
  assert.deepEqual((await api.getBillingStatus('piscina')).prices, { month: 1900, year: 17900 });
  // Appassionati: piano Passione, con prezzo e crediti propri.
  st = await api.getBillingStatus('dario');
  assert.deepEqual([st.audience, st.prices], ['enthusiast', { month: 199, year: 1900 }]);

  // Messaggi: Base non può scrivere a chi non è un collegamento; alle strutture sì.
  await rejects(api.sendMessage('anna', { receiverId: 'bob', content: 'ciao' }), 402, 'premium_required');
  await api.sendMessage('anna', { receiverId: 'piscina', content: 'Info sui corsi?' });
  // La struttura risponde: conversazione avviata, libera per entrambi.
  await api.sendMessage('piscina', { receiverId: 'anna', content: 'Certo!' });

  // Prova gratuita: una volta sola.
  await api.startTrial('anna');
  await rejects(api.startTrial('anna'), 409);
  st = await api.getBillingStatus('anna');
  assert.equal(st.premium, true); assert.equal(st.trialAvailable, false); assert.equal(st.inmailCredits, INMAIL_CREDITS.person);

  // Premium: il primo messaggio a uno sconosciuto consuma un credito, i successivi no.
  await api.sendMessage('anna', { receiverId: 'bob', content: 'Ciao Bob, collaboriamo?' });
  assert.equal(col('profiles').anna.inmailCredits, INMAIL_CREDITS.person - 1);
  await api.sendMessage('anna', { receiverId: 'bob', content: 'Ti scrivo di nuovo' });
  await api.sendMessage('bob', { receiverId: 'anna', content: 'Volentieri' }); // risposta libera anche per Base
  assert.equal(col('profiles').anna.inmailCredits, INMAIL_CREDITS.person - 1);
  col('profiles').anna.inmailCredits = 0;
  await rejects(api.sendMessage('anna', { receiverId: 'carla', content: 'ciao' }), 402, 'inmail_exhausted');
  // Collegati: liberi.
  col('profiles').bob.connections = ['carla']; col('profiles').carla.connections = ['bob'];
  await api.sendMessage('bob', { receiverId: 'carla', content: 'ciao' });

  // Visite anonime: con Premium verso un profilo Base.
  col('profiles').anna.hideProfileViews = true;
  await api.recordProfileView('anna', { profileId: 'carla' });
  assert.equal(Object.values(col('notifications')).filter((n) => n.userId === 'carla' && n.type === 'profile_view').at(-1).content, 'Qualcuno ha visualizzato il tuo profilo.');

  // Strutture Base: al massimo BASE_ACTIVE_JOBS annunci attivi; gli SOS non contano. Premium: in evidenza e senza limite.
  const job = { structureId: 'piscina', title: 'Istruttore', description: 'Corsi bambini', role: 'istruttore', city: 'Milano' };
  for (let i = 0; i < BASE_ACTIVE_JOBS; i++) assert.equal((await api.createJob('piscina', job)).featured, false);
  await rejects(api.createJob('piscina', job), 402, 'premium_required');
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await api.createJob('piscina', { ...job, isSOS: true, sosDate: day });
  await api.adminGrantPremium('boss', { userId: 'piscina', days: 30 });
  await rejects(api.adminGrantPremium('anna', { userId: 'anna', days: 30 }), 403);
  assert.equal((await api.createJob('piscina', job)).featured, true);

  // Stripe: checkout, poi il webhook firmato attiva l'abbonamento; durante la prova il primo addebito è rinviato.
  const checkout = await api.createCheckout('anna', { provider: 'stripe', period: 'year' });
  assert.equal(checkout.url, 'https://checkout.stripe.com/c/cs_1');
  const body = decodeURIComponent(calls.find((c) => c.url.endsWith('/checkout/sessions')).init.body);
  assert.ok(body.includes('line_items[0][price]=price_py') && body.includes('client_reference_id=anna') && body.includes('subscription_data[trial_end]='));
  await rejects(api.createCheckout('anna', { provider: 'stripe', period: 'settimana' }), 400);

  const periodEnd = Math.floor(Date.now() / 1000) + 365 * 86400;
  stripeSubs.sub_1 = { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { userId: 'anna' }, cancel_at_period_end: false, items: { data: [{ current_period_end: periodEnd, price: { recurring: { interval: 'year' } } }] } };
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', client_reference_id: 'anna' } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac('sha256', 'whsec_x').update(`${t}.${event}`).digest('hex')}`;
  await rejects(api._stripeWebhook(event, 't=1,v1=00'), 400);
  await api._stripeWebhook(event, sig);
  assert.equal(new Date(col('profiles').anna.premiumUntil).getTime(), periodEnd * 1000);
  st = await api.getBillingStatus('anna');
  assert.deepEqual([st.subscription.provider, st.subscription.status, st.subscription.period], ['stripe', 'active', 'year']);
  await rejects(api.createCheckout('anna', { provider: 'paypal', period: 'month' }), 409); // già abbonata
  assert.equal((await api.manageSubscription('anna')).url, 'https://billing.stripe.com/p/1');

  // Disdetta da Stripe: il Premium resta fino alla fine del periodo pagato.
  stripeSubs.sub_1 = { ...stripeSubs.sub_1, status: 'canceled', cancel_at_period_end: true };
  const ev2 = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  await api._stripeWebhook(ev2, `t=${t},v1=${crypto.createHmac('sha256', 'whsec_x').update(`${t}.${ev2}`).digest('hex')}`);
  assert.equal(new Date(col('profiles').anna.premiumUntil).getTime(), periodEnd * 1000);

  // PayPal: abbonamento, ritorno all'app, webhook verificato.
  const pp = await api.createCheckout('bob', { provider: 'paypal', period: 'month' });
  assert.equal(pp.url, 'https://www.paypal.com/approve/I-ABCDEF123');
  await rejects(api.confirmPaypal('carla', { subscriptionId: 'I-ABCDEF123' }), 403); // non è suo
  assert.deepEqual(await api.confirmPaypal('bob', { subscriptionId: 'I-ABCDEF123' }), { status: 'active' });
  assert.equal((await api.getBillingStatus('bob')).premium, true);
  const ppEvent = JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-ABCDEF123' } });
  await rejects(api._paypalWebhook(ppEvent, { 'paypal-transmission-sig': 'no' }), 400);
  assert.deepEqual(await api._paypalWebhook(ppEvent, { 'paypal-transmission-sig': 'ok' }), { received: true });
  assert.deepEqual(await api.manageSubscription('bob', { cancel: true }), { cancelled: true });

  // Prezzi dal pannello: solo amministratori, con controlli; nuovo prezzo Stripe e piano PayPal creati subito.
  await rejects(api.adminGetPlans('anna'), 403);
  await rejects(api.adminUpdatePlans('anna', { prices: { person_month: 599 } }), 403);
  await rejects(api.adminUpdatePlans('boss', { prices: { person_month: 50 } }), 400);
  await rejects(api.adminUpdatePlans('boss', { prices: { person_month: 299 } }), 400); // annuale > 12 mesi
  await rejects(api.adminUpdatePlans('boss', { prices: { gold_month: 999 } }), 400);
  const updated = await api.adminUpdatePlans('boss', { prices: { person_month: 599, person_year: 4790 } });
  assert.deepEqual(updated.changed, ['person_month']);
  assert.deepEqual(updated.warnings, []);
  const pm = updated.plans.find((p) => p.key === 'person_month');
  assert.deepEqual([pm.amount, pm.defaultAmount, pm.stripe, pm.paypal], [599, 499, true, true]);
  assert.deepEqual([col('plans').person_month.stripePriceId, col('plans').person_month.paypalPlanId], ['price_new_599', 'P-NEW-5.99']);
  assert.equal(updated.plans.find((p) => p.key === 'person_year').subscribers, 0); // anna ha disdetto
  assert.deepEqual((await api.getBillingStatus('carla')).prices, { month: 599, year: 4790 });
  await api.createCheckout('carla', { provider: 'stripe', period: 'month' });
  assert.ok(decodeURIComponent(calls.filter((c) => c.url.endsWith('/checkout/sessions')).at(-1).init.body).includes('line_items[0][price]=price_new_599'));
  const ppCarla = await api.createCheckout('carla', { provider: 'paypal', period: 'month' });
  assert.ok(ppCarla.url);
  assert.equal(JSON.parse(calls.filter((c) => c.url.endsWith('/v1/billing/subscriptions')).at(-1).init.body).plan_id, 'P-NEW-5.99');
  // Il piano appassionati non ha ancora un prezzo Stripe: si crea al primo pagamento.
  await api.createCheckout('dario', { provider: 'stripe', period: 'month' });
  assert.equal(col('plans').enthusiast_month.stripePriceId, 'price_new_199');

  // Candidature Premium in cima: la riga lo segna (scritta solo dalla Function).
  const opening = await api.createJob('piscina', { structureId: 'piscina', title: 'Allenatore', description: 'Squadra agonisti', role: 'allenatore', city: 'Milano' });
  assert.equal((await api.applyForJob('bob', { jobId: opening.$id })).priority, true);
  assert.equal((await api.applyForJob('carla', { jobId: opening.$id })).priority, false);

  // Area staff: con il piano Base al massimo BASE_STAFF persone.
  P('lido', { userType: 'structure', structureName: 'Lido' });
  const lidoJob = await api.createJob('lido', { structureId: 'lido', title: 'Assistente bagnanti', description: 'Turni estivi', role: 'assistente bagnanti', city: 'Rimini' });
  const apps = [];
  for (let i = 0; i <= BASE_STAFF; i++) { P(`s${i}`); apps.push(await api.applyForJob(`s${i}`, { jobId: lidoJob.$id })); }
  for (let i = 0; i < BASE_STAFF; i++) await api.hireCandidate('lido', { applicationId: apps[i].$id });
  await rejects(api.hireCandidate('lido', { applicationId: apps[BASE_STAFF].$id }), 402, 'premium_required');
  await api.adminGrantPremium('boss', { userId: 'lido', days: 30 });
  assert.deepEqual(await api.hireCandidate('lido', { applicationId: apps[BASE_STAFF].$id }), { hired: true });

  // SOS: Base solo nella provincia; Premium anche nelle altre province della regione.
  const tomorrow = new Date(Date.now() + 86400000);
  const slot = `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][tomorrow.getUTCDay()]}-mattina`;
  P('mi1', { province: 'MI', availability: [slot] }); P('bg1', { province: 'BG', availability: [slot] }); P('to1', { province: 'TO', availability: [slot] });
  P('base', { userType: 'structure', structureName: 'Piscina Base' });
  const sos = { title: 'Sostituzione', description: 'Turno del mattino', role: 'assistente bagnanti', city: 'Milano', province: 'MI', isSOS: true, sosDate: tomorrow.toISOString().slice(0, 10) };
  assert.equal((await api.createJob('base', { ...sos, structureId: 'base' })).notified, 1);
  assert.equal((await api.createJob('piscina', { ...sos, structureId: 'piscina' })).notified, 2); // MI e BG, non TO

  // Statistiche solo Premium.
  assert.equal((await api.getMyStats('anna')).viewsPerDay.length, 30);
  await rejects(api.getMyStats('carla'), 402, 'premium_required');

  // Eliminazione dell'account: l'abbonamento Stripe ancora attivo viene disdetto.
  stripeSubs.sub_1 = { ...stripeSubs.sub_1, status: 'active', cancel_at_period_end: false };
  await api._stripeWebhook(event, sig);
  await api.deleteAccount('anna', { confirmation: 'ELIMINA' });
  assert.ok(calls.some((c) => c.url.endsWith('/subscriptions/sub_1') && c.init.method === 'DELETE'));
  assert.equal(Object.values(col('subscriptions')).filter((s) => s.userId === 'anna').length, 0);
});
