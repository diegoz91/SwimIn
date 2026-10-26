/**
 * SwimIn Premium: piani, prova gratuita, pagamenti con Stripe e PayPal.
 *
 * Il diritto al Premium è il campo `premiumUntil` del profilo (scritto solo qui).
 * Un abbonamento attivo lo spinge in avanti a ogni rinnovo; una disdetta lo lascia
 * valere fino alla fine del periodo già pagato.
 * Stripe e PayPal parlano con le loro API REST (niente SDK); i webhook arrivano
 * all'indirizzo della Function (/webhooks/stripe, /webhooks/paypal) e sono verificati.
 */
import crypto from 'node:crypto';

export const TRIAL_DAYS = 30;
/** Piani: professionisti, appassionati, strutture. */
export const AUDIENCES = ['person', 'enthusiast', 'structure'];
export const PERIODS = ['month', 'year'];
export const PLAN_KEYS = AUDIENCES.flatMap((a) => PERIODS.map((p) => `${a}_${p}`));
/** Prezzi predefiniti in centesimi di euro (gli amministratori li cambiano dal pannello: tabella `plans`). */
export const PRICES = {
  person: { month: 499, year: 4790 },
  enthusiast: { month: 199, year: 1900 },
  structure: { month: 1900, year: 17900 },
};
/** Limiti dei prezzi impostabili dal pannello (centesimi). */
export const PRICE_MIN = 99;
export const PRICE_MAX = 99_900;
/** Messaggi diretti a chi non è un collegamento, al mese. */
export const INMAIL_CREDITS = { person: 15, enthusiast: 5, structure: 40 };
/** Annunci attivi contemporaneamente per le strutture Base (gli SOS non contano). */
export const BASE_ACTIVE_JOBS = 2;
/** Membri dello staff per le strutture Base. */
export const BASE_STAFF = 5;
/** Avvisi di lavoro salvati: Base e Premium. */
export const BASE_ALERTS = 2;
export const PREMIUM_ALERTS = 10;

const DAY = 86_400_000;

export const isPremium = (profile, now = Date.now()) => !!profile?.premiumUntil && new Date(profile.premiumUntil).getTime() > now;
export const audienceOf = (profile) =>
  profile?.userType === 'structure' ? 'structure' : profile?.personType === 'enthusiast' ? 'enthusiast' : 'person';

const PLAN_LABEL = { person: 'SwimIn Premium', enthusiast: 'SwimIn Premium Passione', structure: 'SwimIn Premium Strutture' };
export const planName = (audience, period, amount) => `${PLAN_LABEL[audience]} ${period === 'month' ? 'mensile' : 'annuale'} ${(amount / 100).toFixed(2)} EUR`;

/** Verifica della firma dei webhook Stripe (header Stripe-Signature, tolleranza 5 minuti). */
export function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0] !== 'v1'));
  const signatures = String(header).split(',').map((kv) => kv.trim()).filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

const form = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === 'object') return form(v, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });

export function billingActions({ find, get, list, create, update, fail, C, Query, users, notify, isAdmin, config = {}, fetchImpl = fetch, log = () => {} }) {
  const { stripe = {}, paypal = {}, appUrl = '' } = config;
  // Prezzi e piani mancanti (es. un prezzo appena cambiato dal pannello) si creano al primo pagamento.
  const stripeReady = !!stripe.secretKey;
  const paypalReady = !!(paypal.clientId && paypal.secret);
  const paypalBase = paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const back = (path) => `${(appUrl || '').replace(/\/$/, '')}${path}`;

  // ---------------- Stripe ----------------
  const stripeCall = async (method, path, body) => {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
      body: body ? form(body).join('&') : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      log(`Stripe ${path}: ${data?.error?.message || res.status}`);
      fail(502, 'Il servizio di pagamento non risponde: riprova tra poco.');
    }
    return data;
  };

  // ---------------- PayPal ----------------
  let paypalToken = null;
  const paypalCall = async (method, path, body) => {
    if (!paypalToken) {
      const res = await fetchImpl(`${paypalBase}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${paypal.clientId}:${paypal.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        log(`PayPal token: ${res.status}`);
        fail(502, 'Il servizio di pagamento non risponde: riprova tra poco.');
      }
      paypalToken = data.access_token;
    }
    const res = await fetchImpl(`${paypalBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${paypalToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      log(`PayPal ${path}: ${data?.message || res.status}`);
      fail(502, 'Il servizio di pagamento non risponde: riprova tra poco.');
    }
    return data;
  };

  // ---------------- Piani e prezzi ----------------
  /**
   * Prezzo e identificativi di ogni piano. La tabella `plans` (scritta solo dagli amministratori,
   * tramite adminUpdatePlans) ha la precedenza; senza riga valgono i prezzi predefiniti e gli
   * identificativi creati da setup-db (variabili della Function).
   */
  const loadPlans = async () => {
    let rows = [];
    try {
      rows = (await list(C.plans, [Query.limit(50)])).documents;
    } catch (e) {
      log(`piani: ${e?.message || e}`); // tabella non ancora creata: prezzi predefiniti
    }
    const byKey = Object.fromEntries(rows.map((r) => [r.$id, r]));
    return Object.fromEntries(
      PLAN_KEYS.map((key) => {
        const [audience, period] = key.split('_');
        const row = byKey[key];
        const amount = Number.isInteger(row?.amount) ? row.amount : PRICES[audience][period];
        const isDefault = amount === PRICES[audience][period];
        return [key, {
          key, audience, period, amount,
          stripePriceId: row?.stripePriceId || (isDefault ? stripe.prices?.[key] || '' : ''),
          paypalPlanId: row?.paypalPlanId || (isDefault ? paypal.plans?.[key] || '' : ''),
          updatedAt: row?.$updatedAt || null,
        }];
      })
    );
  };

  const savePlan = async (key, patch) => {
    if (await find(C.plans, key)) return update(C.plans, key, patch);
    return create(C.plans, patch, [], key);
  };

  /** Prezzo Stripe del piano: se manca lo crea (stesso prodotto, la lookup key passa al nuovo prezzo). */
  const ensureStripePrice = async (plan) => {
    if (plan.stripePriceId) return plan.stripePriceId;
    const lookup = `swimin_${plan.key}`;
    const found = (await stripeCall('GET', `/prices?active=true&limit=1&lookup_keys[]=${lookup}`)).data?.[0];
    let id = found && found.unit_amount === plan.amount ? found.id : '';
    if (!id) {
      const created = await stripeCall('POST', '/prices', {
        currency: 'eur',
        unit_amount: plan.amount,
        recurring: { interval: plan.period },
        lookup_key: lookup,
        transfer_lookup_key: true,
        tax_behavior: 'inclusive',
        ...(found?.product ? { product: typeof found.product === 'string' ? found.product : found.product.id } : { product_data: { name: `${PLAN_LABEL[plan.audience]} (${plan.period === 'month' ? 'mensile' : 'annuale'})` } }),
      });
      id = created.id;
    }
    await savePlan(plan.key, { amount: plan.amount, stripePriceId: id });
    plan.stripePriceId = id;
    return id;
  };

  /** Piano PayPal: se manca lo crea sotto il prodotto "SwimIn Premium". */
  const ensurePaypalPlan = async (plan) => {
    if (plan.paypalPlanId) return plan.paypalPlanId;
    const products = await paypalCall('GET', '/v1/catalogs/products?page_size=20');
    const product = (products.products || []).find((p) => p.name === 'SwimIn Premium') || (await paypalCall('POST', '/v1/catalogs/products', { name: 'SwimIn Premium', type: 'SERVICE', category: 'SOFTWARE' }));
    const created = await paypalCall('POST', '/v1/billing/plans', {
      product_id: product.id,
      name: planName(plan.audience, plan.period, plan.amount),
      status: 'ACTIVE',
      billing_cycles: [{ frequency: { interval_unit: plan.period === 'month' ? 'MONTH' : 'YEAR', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: (plan.amount / 100).toFixed(2), currency_code: 'EUR' } } }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
    });
    await savePlan(plan.key, { amount: plan.amount, paypalPlanId: created.id });
    plan.paypalPlanId = created.id;
    return created.id;
  };

  /** Durata di un piano PayPal: dai piani noti, altrimenti chiedendola a PayPal (piani di prezzi precedenti). */
  const paypalPeriodOf = async (planId) => {
    const plans = await loadPlans();
    const known = Object.values(plans).find((p) => p.paypalPlanId === planId) || Object.entries(paypal.plans || {}).find(([, id]) => id === planId)?.[0];
    if (known) return (typeof known === 'string' ? known : known.key).endsWith('year') ? 'year' : 'month';
    if (!planId) return 'month';
    const plan = await paypalCall('GET', `/v1/billing/plans/${encodeURIComponent(planId)}`).catch(() => null);
    return plan?.billing_cycles?.find((c) => c.tenure_type === 'REGULAR')?.frequency?.interval_unit === 'YEAR' ? 'year' : 'month';
  };

  const subId = (provider, externalId) => crypto.createHash('sha256').update(`${provider}:${externalId}`).digest('hex').slice(0, 32);

  /**
   * Registra lo stato di un abbonamento e aggiorna il diritto al Premium.
   * `currentPeriodEnd`: fino a quando è pagato (ISO).
   */
  const applySubscription = async (userId, s) => {
    const profile = await find(C.profiles, userId);
    if (!profile) return null;
    const id = subId(s.provider, s.externalId);
    const row = {
      userId,
      provider: s.provider,
      externalId: s.externalId,
      customerId: s.customerId || '',
      status: s.status,
      period: s.period || '',
      audience: audienceOf(profile),
      currentPeriodEnd: s.currentPeriodEnd || '',
      cancelAtPeriodEnd: !!s.cancelAtPeriodEnd,
    };
    if (await find(C.subscriptions, id)) await update(C.subscriptions, id, row);
    else await create(C.subscriptions, row, [], id);

    const paidUntil = s.currentPeriodEnd ? new Date(s.currentPeriodEnd).getTime() : 0;
    const active = ['active', 'trialing', 'past_due'].includes(s.status);
    const was = isPremium(profile);
    // Mai accorciare: una prova o un periodo già pagato restano validi fino alla loro scadenza.
    const current = profile.premiumUntil ? new Date(profile.premiumUntil).getTime() : 0;
    const until = active ? Math.max(current, paidUntil) : current;
    const patch = { premiumSource: s.provider };
    if (until !== current) patch.premiumUntil = new Date(until).toISOString();
    if (active && !profile.premiumSince) patch.premiumSince = new Date().toISOString();
    await update(C.profiles, userId, patch);
    if (active && !was) await notify(userId, 'general', 'Benvenuto in SwimIn Premium: i vantaggi sono già attivi.', '');
    return row;
  };

  const stripePeriodEnd = (sub) => {
    const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? sub.trial_end;
    return end ? new Date(end * 1000).toISOString() : '';
  };

  const syncStripe = async (subscriptionId, fallbackUserId) => {
    const sub = await stripeCall('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const userId = sub.metadata?.userId || fallbackUserId;
    if (!userId) return null;
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    return applySubscription(userId, {
      provider: 'stripe',
      externalId: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      status: sub.status,
      period: interval === 'year' ? 'year' : 'month',
      currentPeriodEnd: stripePeriodEnd(sub),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    });
  };

  const PAYPAL_STATUS = { ACTIVE: 'active', APPROVAL_PENDING: 'incomplete', APPROVED: 'incomplete', SUSPENDED: 'past_due', CANCELLED: 'canceled', EXPIRED: 'canceled' };

  const syncPaypal = async (subscriptionId, expectedUserId) => {
    const sub = await paypalCall('GET', `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const userId = sub.custom_id;
    if (!userId || (expectedUserId && userId !== expectedUserId)) fail(403, 'Abbonamento non tuo.');
    const period = await paypalPeriodOf(sub.plan_id);
    const next = sub.billing_info?.next_billing_time;
    // Un giorno di margine: il rinnovo PayPal può arrivare qualche ora dopo la scadenza.
    const end = next ? new Date(new Date(next).getTime() + DAY).toISOString() : '';
    return applySubscription(userId, {
      provider: 'paypal',
      externalId: sub.id,
      customerId: sub.subscriber?.payer_id || '',
      status: PAYPAL_STATUS[sub.status] || 'incomplete',
      period,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: sub.status === 'CANCELLED',
    });
  };

  const latestSubscription = async (me) =>
    (await list(C.subscriptions, [Query.equal('userId', me), Query.orderDesc('$updatedAt'), Query.limit(5)])).documents.find((s) => s.status !== 'incomplete') || null;

  const api = {
    async getBillingStatus(me) {
      const profile = await get(C.profiles, me);
      const audience = audienceOf(profile);
      const [sub, plans] = await Promise.all([latestSubscription(me), loadPlans()]);
      return {
        premium: isPremium(profile),
        premiumUntil: profile.premiumUntil || null,
        source: profile.premiumSource || null,
        trialAvailable: !profile.premiumTrialUsed && !isPremium(profile),
        trialDays: TRIAL_DAYS,
        audience,
        prices: { month: plans[`${audience}_month`].amount, year: plans[`${audience}_year`].amount },
        providers: { stripe: stripeReady, paypal: paypalReady },
        inmailCredits: isPremium(profile) ? profile.inmailCredits ?? INMAIL_CREDITS[audience] : 0,
        subscription: sub
          ? { provider: sub.provider, status: sub.status, period: sub.period, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
          : null,
      };
    },

    /** Prova gratuita di 30 giorni, una sola volta per account, senza carta. */
    async startTrial(me) {
      const profile = await get(C.profiles, me);
      if (profile.premiumTrialUsed) fail(409, 'Hai già usato la prova gratuita.');
      if (isPremium(profile)) fail(409, 'Sei già Premium.');
      const premiumUntil = new Date(Date.now() + TRIAL_DAYS * DAY).toISOString();
      await update(C.profiles, me, { premiumUntil, premiumSource: 'trial', premiumTrialUsed: true, premiumSince: profile.premiumSince || new Date().toISOString(), inmailCredits: INMAIL_CREDITS[audienceOf(profile)], inmailResetAt: new Date(Date.now() + 30 * DAY).toISOString() });
      await notify(me, 'general', `Prova Premium attiva fino al ${premiumUntil.slice(8, 10)}/${premiumUntil.slice(5, 7)}: esplora i vantaggi.`, '');
      return { premiumUntil };
    },

    /** Avvia il pagamento: restituisce l'indirizzo della pagina di Stripe o PayPal. */
    async createCheckout(me, { provider, period } = {}) {
      if (!['month', 'year'].includes(period)) fail(400, 'Scegli mensile o annuale.');
      const profile = await get(C.profiles, me);
      const audience = audienceOf(profile);
      const plan = (await loadPlans())[`${audience}_${period}`];
      const active = await latestSubscription(me);
      if (active && ['active', 'trialing', 'past_due'].includes(active.status) && !active.cancelAtPeriodEnd) fail(409, 'Hai già un abbonamento attivo: lo gestisci da questa pagina.');
      // Se è in corso la prova (o un periodo pagato), il primo addebito parte alla sua scadenza.
      const startsAt = isPremium(profile) ? new Date(profile.premiumUntil).getTime() : 0;
      const deferred = startsAt - Date.now() > 2 * DAY;

      if (provider === 'stripe') {
        if (!stripeReady) fail(503, 'Il pagamento con carta non è ancora attivo.');
        const email = users ? (await users.get({ userId: me }).catch(() => ({}))).email : undefined;
        const session = await stripeCall('POST', '/checkout/sessions', {
          mode: 'subscription',
          line_items: { 0: { price: await ensureStripePrice(plan), quantity: 1 } },
          success_url: back('/premium?esito=ok'),
          cancel_url: back('/premium?esito=annullato'),
          client_reference_id: me,
          customer_email: email || undefined,
          allow_promotion_codes: true,
          locale: 'it',
          metadata: { userId: me },
          subscription_data: { metadata: { userId: me }, ...(deferred ? { trial_end: Math.floor(startsAt / 1000) } : {}) },
        });
        return { url: session.url };
      }
      if (provider === 'paypal') {
        if (!paypalReady) fail(503, 'Il pagamento con PayPal non è ancora attivo.');
        const sub = await paypalCall('POST', '/v1/billing/subscriptions', {
          plan_id: await ensurePaypalPlan(plan),
          custom_id: me,
          ...(deferred ? { start_time: new Date(startsAt).toISOString() } : {}),
          application_context: {
            brand_name: 'SwimIn',
            locale: 'it-IT',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'SUBSCRIBE_NOW',
            return_url: back('/premium?esito=paypal'),
            cancel_url: back('/premium?esito=annullato'),
          },
        });
        const approve = (sub.links || []).find((l) => l.rel === 'approve')?.href;
        if (!approve) fail(502, 'PayPal non ha restituito la pagina di pagamento.');
        return { url: approve };
      }
      fail(400, 'Metodo di pagamento non valido.');
    },

    /** Ritorno da PayPal: conferma subito l'abbonamento (il webhook arriva comunque). */
    async confirmPaypal(me, { subscriptionId } = {}) {
      if (!paypalReady) fail(503, 'PayPal non è attivo.');
      if (typeof subscriptionId !== 'string' || !/^I-[A-Z0-9]{6,30}$/.test(subscriptionId)) fail(400, 'Abbonamento non valido.');
      const row = await syncPaypal(subscriptionId, me);
      return { status: row?.status || 'incomplete' };
    },

    /** Gestione dell'abbonamento: portale clienti Stripe, o disdetta PayPal. */
    async manageSubscription(me, { cancel = false } = {}) {
      const sub = await latestSubscription(me);
      if (!sub) fail(404, 'Nessun abbonamento da gestire.');
      if (sub.provider === 'stripe') {
        if (!stripeReady) fail(503, 'Il pagamento con carta non è attivo.');
        const portal = await stripeCall('POST', '/billing_portal/sessions', { customer: sub.customerId, return_url: back('/premium'), locale: 'it' });
        return { url: portal.url };
      }
      if (sub.provider === 'paypal') {
        if (!cancel) return { url: 'https://www.paypal.com/myaccount/autopay/' };
        if (!paypalReady) fail(503, 'PayPal non è attivo.');
        await paypalCall('POST', `/v1/billing/subscriptions/${encodeURIComponent(sub.externalId)}/cancel`, { reason: 'Disdetta richiesta da SwimIn' });
        await syncPaypal(sub.externalId, me);
        return { cancelled: true };
      }
      fail(400, 'Abbonamento non gestibile.');
    },

    /** Amministratori: Premium in omaggio (promozioni, assistenza). days = 0 lo revoca. */
    async adminGrantPremium(me, { userId, days } = {}) {
      if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
      const n = Number(days);
      if (!Number.isInteger(n) || n < 0 || n > 3650) fail(400, 'Giorni non validi.');
      const profile = await get(C.profiles, userId);
      const premiumUntil = n === 0 ? new Date().toISOString() : new Date(Math.max(Date.now(), isPremium(profile) ? new Date(profile.premiumUntil).getTime() : 0) + n * DAY).toISOString();
      await update(C.profiles, userId, { premiumUntil, premiumSource: n === 0 ? profile.premiumSource || '' : 'admin', inmailCredits: INMAIL_CREDITS[audienceOf(profile)] });
      if (n > 0) await notify(userId, 'general', `Ti abbiamo regalato SwimIn Premium per ${n} giorni.`, '');
      return { premiumUntil };
    },

    /** Amministratori: prezzi attuali di tutti i piani, con gli abbonati attivi. */
    async adminGetPlans(me) {
      if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
      const plans = await loadPlans();
      let subs = [];
      try {
        subs = (await list(C.subscriptions, [Query.equal('status', ['active', 'trialing', 'past_due']), Query.limit(5000)])).documents;
      } catch (e) {
        log(`abbonati: ${e?.message || e}`);
      }
      return {
        plans: PLAN_KEYS.map((key) => {
          const p = plans[key];
          return {
            key, audience: p.audience, period: p.period, amount: p.amount, defaultAmount: PRICES[p.audience][p.period], updatedAt: p.updatedAt,
            subscribers: subs.filter((s) => s.audience === p.audience && s.period === p.period).length,
            stripe: !!p.stripePriceId, paypal: !!p.paypalPlanId,
          };
        }),
        providers: { stripe: stripeReady, paypal: paypalReady },
        limits: { min: PRICE_MIN, max: PRICE_MAX },
      };
    },

    /**
     * Amministratori: nuovi prezzi (centesimi) per uno o più piani, es. { prices: { person_month: 599 } }.
     * Valgono per i nuovi abbonamenti; chi è già abbonato mantiene il prezzo che ha sottoscritto.
     * Prezzi Stripe e piani PayPal nuovi si creano subito (o al primo pagamento, se il servizio non risponde).
     */
    async adminUpdatePlans(me, { prices } = {}) {
      if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
      if (!prices || typeof prices !== 'object') fail(400, 'Indica i prezzi da cambiare.');
      const plans = await loadPlans();
      const next = Object.fromEntries(PLAN_KEYS.map((k) => [k, plans[k].amount]));
      for (const [key, value] of Object.entries(prices)) {
        if (!PLAN_KEYS.includes(key)) fail(400, 'Piano non valido.');
        const n = Number(value);
        if (!Number.isInteger(n) || n < PRICE_MIN || n > PRICE_MAX) fail(400, `Prezzo non valido: da ${(PRICE_MIN / 100).toFixed(2).replace('.', ',')} a ${(PRICE_MAX / 100).toFixed(0)} €.`);
        next[key] = n;
      }
      for (const a of AUDIENCES) {
        if (next[`${a}_year`] > next[`${a}_month`] * 12) fail(400, 'L’abbonamento annuale non può costare più di 12 mesi.');
      }
      const changed = PLAN_KEYS.filter((k) => next[k] !== plans[k].amount);
      const warnings = [];
      for (const key of changed) {
        await savePlan(key, { amount: next[key], stripePriceId: '', paypalPlanId: '' });
        const plan = { ...plans[key], amount: next[key], stripePriceId: '', paypalPlanId: '' };
        // Il fallimento di un servizio non blocca il cambio: si riprova al primo pagamento.
        if (stripeReady) await ensureStripePrice(plan).catch((e) => warnings.push(`Stripe: ${e?.message || e}`));
        if (paypalReady) await ensurePaypalPlan(plan).catch((e) => warnings.push(`PayPal: ${e?.message || e}`));
      }
      log(`prezzi aggiornati da ${me}: ${changed.map((k) => `${k}=${next[k]}`).join(', ') || 'nessuno'}`);
      return { ...(await api.adminGetPlans(me)), changed, warnings };
    },

    // ---------------- Webhook (chiamati dall'entrypoint, non dal client) ----------------
    async _stripeWebhook(rawBody, signature) {
      if (!verifyStripeSignature(rawBody, signature, stripe.webhookSecret)) fail(400, 'Firma non valida.');
      const event = JSON.parse(rawBody);
      const obj = event.data?.object || {};
      if (event.type === 'checkout.session.completed' && obj.subscription) await syncStripe(obj.subscription, obj.client_reference_id);
      else if (event.type?.startsWith('customer.subscription.')) await syncStripe(obj.id);
      else if (event.type === 'invoice.paid' && obj.subscription) await syncStripe(obj.subscription);
      return { received: true };
    },

    async _paypalWebhook(rawBody, headers) {
      if (!paypal.webhookId) fail(400, 'Webhook PayPal non configurato.');
      const event = JSON.parse(rawBody);
      const check = await paypalCall('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: paypal.webhookId,
        webhook_event: event,
      });
      if (check.verification_status !== 'SUCCESS') fail(400, 'Firma non valida.');
      const res = event.resource || {};
      const id = event.event_type?.startsWith('BILLING.SUBSCRIPTION.') ? res.id : res.billing_agreement_id;
      if (id) await syncPaypal(id);
      return { received: true };
    },

    /** Eliminazione dell'account: disdice subito gli abbonamenti attivi, così non ci sono altri addebiti. */
    async _cancelAllFor(me) {
      const subs = (await list(C.subscriptions, [Query.equal('userId', me), Query.limit(20)])).documents;
      for (const sub of subs.filter((x) => ['active', 'trialing', 'past_due'].includes(x.status))) {
        try {
          if (sub.provider === 'stripe' && stripeReady) await stripeCall('DELETE', `/subscriptions/${encodeURIComponent(sub.externalId)}`);
          if (sub.provider === 'paypal' && paypalReady) await paypalCall('POST', `/v1/billing/subscriptions/${encodeURIComponent(sub.externalId)}/cancel`, { reason: 'Account eliminato' });
        } catch (e) {
          log(`disdetta ${sub.provider} ${sub.externalId} non riuscita: ${e?.message || e}`);
        }
      }
      return subs.length;
    },

    _isPremium: isPremium,
  };
  return api;
}
