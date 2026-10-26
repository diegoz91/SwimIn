/**
 * Prepara i prodotti di SwimIn Premium su Stripe e PayPal (idempotente):
 * prezzi e piani mensili/annuali per professionisti, appassionati e strutture, e i webhook verso la Function.
 * Usato da setup-db.js quando in .env.setup ci sono le chiavi dei due servizi.
 */
import { PLAN_KEYS, PRICES, TRIAL_DAYS, planName } from '../../functions/api/src/billing.js';

// Prezzi predefiniti: se un amministratore li cambia dal pannello, la Function crea i nuovi prezzi da sé.
const KEYS = PLAN_KEYS;
const LABEL = { person: 'SwimIn Premium', enthusiast: 'SwimIn Premium Passione', structure: 'SwimIn Premium Strutture' };
const STRIPE_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid'];
const PAYPAL_EVENTS = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.UPDATED', 'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'PAYMENT.SALE.COMPLETED'];

const form = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) => {
        const key = prefix ? `${prefix}[${k}]` : k;
        if (v === undefined || v === null) return [];
        if (Array.isArray(v)) return v.flatMap((x, i) => form({ [i]: x }, key));
        if (typeof v === 'object') return form(v, key);
        return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
    });

/** Prezzi Stripe (lookup key "swimin_<chiave>") e, se c'è l'indirizzo della Function, il webhook. */
export async function provisionStripe(secretKey, { webhookUrl } = {}) {
    const call = async (method, path, body) => {
        const res = await fetch(`https://api.stripe.com/v1${path}`, {
            method,
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
            body: body ? form(body).join('&') : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Stripe ${path}: ${data?.error?.message || res.status}`);
        return data;
    };
    const found = await call('GET', `/prices?active=true&limit=50&${KEYS.map((k) => `lookup_keys[]=swimin_${k}`).join('&')}`);
    const prices = {};
    for (const key of KEYS) {
        const [audience, period] = key.split('_');
        const existing = found.data.find((p) => p.lookup_key === `swimin_${key}` && p.unit_amount === PRICES[audience][period]);
        if (existing) {
            prices[key] = existing.id;
            continue;
        }
        // Prezzo nuovo (o cambiato): la lookup key passa al nuovo prezzo.
        const created = await call('POST', '/prices', {
            currency: 'eur',
            unit_amount: PRICES[audience][period],
            recurring: { interval: period },
            lookup_key: `swimin_${key}`,
            transfer_lookup_key: true,
            tax_behavior: 'inclusive',
            product_data: { name: `${LABEL[audience]} (${period === 'month' ? 'mensile' : 'annuale'})` },
        });
        prices[key] = created.id;
    }
    let webhookSecret = null;
    if (webhookUrl) {
        const hooks = await call('GET', '/webhook_endpoints?limit=100');
        if (!hooks.data.some((h) => h.url === webhookUrl)) {
            const hook = await call('POST', '/webhook_endpoints', { url: webhookUrl, enabled_events: STRIPE_EVENTS, description: 'SwimIn Premium' });
            webhookSecret = hook.secret; // restituito solo alla creazione
        }
    }
    return { prices, webhookSecret };
}

/** Prodotto e piani PayPal (riconosciuti dal nome) e, se c'è l'indirizzo della Function, il webhook. */
export async function provisionPaypal({ clientId, secret, mode, webhookUrl }) {
    const base = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
    });
    const token = (await tokenRes.json()).access_token;
    if (!token) throw new Error('PayPal: credenziali non valide');
    const call = async (method, path, body) => {
        const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(`PayPal ${path}: ${data?.message || res.status}`);
        return data;
    };
    const products = await call('GET', '/v1/catalogs/products?page_size=20');
    const product = (products.products || []).find((p) => p.name === 'SwimIn Premium') || (await call('POST', '/v1/catalogs/products', { name: 'SwimIn Premium', type: 'SERVICE', category: 'SOFTWARE' }));
    const plansList = await call('GET', `/v1/billing/plans?product_id=${product.id}&page_size=20`);
    const plans = {};
    for (const key of KEYS) {
        const [audience, period] = key.split('_');
        const amount = (PRICES[audience][period] / 100).toFixed(2);
        const name = planName(audience, period, PRICES[audience][period]);
        const existing = (plansList.plans || []).find((p) => p.name === name && p.status === 'ACTIVE');
        if (existing) {
            plans[key] = existing.id;
            continue;
        }
        const plan = await call('POST', '/v1/billing/plans', {
            product_id: product.id,
            name,
            status: 'ACTIVE',
            billing_cycles: [{ frequency: { interval_unit: period === 'month' ? 'MONTH' : 'YEAR', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: amount, currency_code: 'EUR' } } }],
            payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
        });
        plans[key] = plan.id;
    }
    let webhookId = null;
    if (webhookUrl) {
        const hooks = await call('GET', '/v1/notifications/webhooks');
        webhookId = (hooks.webhooks || []).find((h) => h.url === webhookUrl)?.id || (await call('POST', '/v1/notifications/webhooks', { url: webhookUrl, event_types: PAYPAL_EVENTS.map((name) => ({ name })) })).id;
    }
    return { plans, webhookId };
}

export { TRIAL_DAYS };
