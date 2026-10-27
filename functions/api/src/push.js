/**
 * Notifiche fuori dall'app: push del browser (Web Push con VAPID) ed email
 * (Appwrite Messaging, se un provider è configurato). Ogni utente sceglie
 * per categoria cosa ricevere; le preferenze stanno nel profilo.
 */
import crypto from 'node:crypto';
import { sendWebPush } from './webpush.js';

/** Categorie mostrate nelle impostazioni, con i valori predefiniti. */
export const NOTIFY_CATEGORIES = {
  messages: { push: true, email: false },
  connections: { push: true, email: true },
  social: { push: true, email: false },
  jobs: { push: true, email: true },
  sos: { push: true, email: true },
  general: { push: true, email: true },
  // Riepilogo settimanale: solo email.
  digest: { push: false, email: true },
};

const CATEGORY_OF = {
  message: 'messages',
  staff_chat: 'messages',
  connection: 'connections',
  like: 'social',
  comment: 'social',
  endorsement: 'social',
  recommendation: 'social',
  recommendation_request: 'social',
  recommendation_published: 'social',
  review: 'social',
  repost: 'social',
  mention: 'social',
  follow: 'connections',
  group: 'social',
  profile_view: 'social',
  application: 'jobs',
  application_update: 'jobs',
  job_alert: 'jobs',
  rejected: 'jobs',
  hired: 'jobs',
  staff_invite: 'jobs',
  sos: 'sos',
};

export const categoryOf = (type) => CATEGORY_OF[type] || 'general';

/** Pagina da aprire toccando la notifica (deve combaciare con notificationMeta del client). */
export function targetUrl(type, relatedId) {
  switch (type) {
    case 'message': return relatedId ? `/messages?u=${encodeURIComponent(relatedId)}` : '/messages';
    case 'like':
    case 'comment': return relatedId ? `/post/${relatedId}` : '/';
    case 'connection': return '/network';
    case 'application': return relatedId ? `/jobs/${encodeURIComponent(relatedId)}?candidati=nuove` : '/jobs/annunci';
    case 'application_update':
    case 'rejected':
    case 'job_alert':
    case 'sos': return relatedId ? `/jobs/${encodeURIComponent(relatedId)}` : '/jobs';
    case 'hired': return relatedId ? `/profile/${relatedId}` : '/jobs';
    case 'endorsement': return '/profile';
    case 'shift': return '/turni';
    case 'staff_invite': return '/turni?inviti=1';
    case 'group': return relatedId ? `/gruppi/${relatedId}` : '/gruppi';
    case 'staff_chat': return relatedId ? `/profile/${relatedId}?area=chat-staff` : '/';
    case 'system_alert': return '/admin?tab=errori';
    case 'feedback': return '/admin?tab=feedback';
    case 'recommendation': return '/profile?referenze=approva';
    case 'recommendation_published': return relatedId ? `/profile/${relatedId}?sezione=referenze` : '/profile';
    case 'recommendation_request': return relatedId ? `/profile/${relatedId}?referenza=scrivi` : '/profile';
    case 'event': return relatedId ? `/eventi/${relatedId}` : '/eventi';
    case 'mention': return relatedId ? `/post/${relatedId}` : '/';
    case 'follow': return relatedId ? `/profile/${relatedId}` : '/network';
    case 'repost': return relatedId ? `/post/${relatedId}` : '/';
    case 'profile_view': return relatedId ? `/profile/${relatedId}` : '/profile?visite=1';
    default: return '/notifiche';
  }
}

/** Preferenze complete (predefiniti + scelte salvate), da JSON del profilo. */
export function parsePrefs(raw) {
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
  const out = {};
  for (const [cat, def] of Object.entries(NOTIFY_CATEGORIES)) {
    out[cat] = {
      push: typeof saved?.[cat]?.push === 'boolean' ? saved[cat].push : def.push,
      email: typeof saved?.[cat]?.email === 'boolean' ? saved[cat].email : def.email,
    };
  }
  return out;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Email semplice e leggibile ovunque (stili in linea, niente immagini remote). */
export function emailHtml({ title, body, url, appUrl }) {
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}${url}` : '';
  return `<!doctype html><html lang="it"><body style="margin:0;background:#F2F8FA;font-family:Helvetica,Arial,sans-serif;color:#0A2738">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #D7E6EC">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700">SwimIn</td></tr>
<tr><td style="padding:0 28px"><div style="height:4px;border-radius:2px;background:repeating-linear-gradient(90deg,#E23D3D 0 12px,#ffffff 12px 18px,#0E6A97 18px 30px,#ffffff 30px 36px)"></div></td></tr>
<tr><td style="padding:20px 28px 4px;font-size:18px;font-weight:700">${escapeHtml(title)}</td></tr>
<tr><td style="padding:0 28px 20px;font-size:15px;line-height:1.5;color:#334155">${escapeHtml(body)}</td></tr>
${link ? `<tr><td style="padding:0 28px 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0E6A97;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Apri SwimIn</a></td></tr>` : ''}
</table>
<p style="font-size:12px;color:#64748B;max-width:520px;margin:16px auto 0">Ricevi questa email perché hai un account SwimIn. Puoi scegliere quali email ricevere in ${appUrl ? `<a href="${escapeHtml(appUrl.replace(/\/$/, ''))}/profile?tab=impostazioni&amp;sezione=notifiche" style="color:#0E6A97">Impostazioni › Notifiche</a>` : 'Impostazioni › Notifiche'}.</p>
</td></tr></table></body></html>`;
}

const TITLES = {
  messages: 'Nuovo messaggio',
  connections: 'Collegamenti',
  social: 'Attività sui tuoi contenuti',
  jobs: 'Lavoro',
  sos: 'Sostituzione urgente vicino a te',
  general: 'SwimIn',
};

const subscriptionId = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
const isB64u = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s);

export function pushActions({ find, get, list, create, update, remove, fail, C, Query, messaging, ID, vapid, appUrl = '', log = () => {}, fetchImpl }) {
  const pushReady = !!(vapid?.publicKey && vapid?.privateKey && vapid?.subject);

  /** Recapita fuori dall'app una notifica già decisa dal chiamante. Non lancia mai. */
  const deliver = async (userId, type, content, relatedId, { title, channels = ['push', 'email'] } = {}) => {
    try {
      const profile = await find(C.profiles, userId);
      if (!profile || profile.suspended) return { push: 0, email: false };
      const cat = categoryOf(type);
      const prefs = parsePrefs(profile.notificationPrefs)[cat];
      const url = targetUrl(type, relatedId);
      const heading = title || TITLES[cat];
      let pushed = 0;
      let emailed = false;

      if (prefs.push && pushReady && channels.includes('push')) {
        const { documents: subs } = await list(C.pushSubscriptions, [Query.equal('userId', userId), Query.limit(10)]);
        await Promise.all(subs.map(async (s) => {
          try {
            const status = await sendWebPush(
              { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
              { title: heading, body: content, url, tag: `${type}:${relatedId || ''}` },
              vapid,
              { urgency: cat === 'sos' || cat === 'messages' ? 'high' : 'normal', ...(fetchImpl ? { fetchImpl } : {}) }
            );
            if (status === 404 || status === 410) await remove(C.pushSubscriptions, s.$id).catch(() => null);
            else if (status >= 200 && status < 300) pushed++;
            else log(`push ${status} per ${s.$id}`);
          } catch (e) {
            log(`push non inviata: ${e?.message || e}`);
          }
        }));
      }

      if (prefs.email && messaging && channels.includes('email')) {
        try {
          await messaging.createEmail({
            messageId: ID.unique(),
            subject: heading === 'SwimIn' ? content.slice(0, 80) : `${heading} · SwimIn`,
            content: emailHtml({ title: heading, body: content, url, appUrl }),
            users: [userId],
            html: true,
          });
          emailed = true;
        } catch (e) {
          log(`email non inviata: ${e?.message || e}`);
        }
      }
      return { push: pushed, email: emailed };
    } catch (e) {
      log(`recapito fallito: ${e?.message || e}`);
      return { push: 0, email: false };
    }
  };

  return {
    _deliver: deliver,

    async getPushConfig(me) {
      const profile = await get(C.profiles, me);
      const { total } = await list(C.pushSubscriptions, [Query.equal('userId', me), Query.limit(1)]);
      return {
        publicKey: pushReady ? vapid.publicKey : null,
        emailAvailable: !!messaging,
        devices: total,
        prefs: parsePrefs(profile.notificationPrefs),
        categories: Object.keys(NOTIFY_CATEGORIES),
      };
    },

    async savePushSubscription(me, { endpoint, p256dh, auth, userAgent = '' } = {}) {
      if (!pushReady) fail(503, 'Le notifiche push non sono ancora attive.');
      let url;
      try { url = new URL(endpoint); } catch { fail(400, 'Sottoscrizione non valida.'); }
      if (url.protocol !== 'https:' || endpoint.length > 1000) fail(400, 'Sottoscrizione non valida.');
      if (!isB64u(p256dh, 80, 100) || !isB64u(auth, 16, 32)) fail(400, 'Chiavi della sottoscrizione non valide.');
      const id = subscriptionId(endpoint);
      const data = { userId: me, endpoint, p256dh, auth, userAgent: String(userAgent).slice(0, 255) };
      const existing = await find(C.pushSubscriptions, id);
      if (existing) await update(C.pushSubscriptions, id, data);
      else {
        // Massimo 10 dispositivi: oltre, si toglie il più vecchio.
        const { documents } = await list(C.pushSubscriptions, [Query.equal('userId', me), Query.orderAsc('$createdAt'), Query.limit(10)]);
        if (documents.length >= 10) await remove(C.pushSubscriptions, documents[0].$id);
        await create(C.pushSubscriptions, data, [], id);
      }
      return { saved: true };
    },

    async deletePushSubscription(me, { endpoint } = {}) {
      if (typeof endpoint !== 'string') fail(400, 'Parametro mancante: endpoint');
      const row = await find(C.pushSubscriptions, subscriptionId(endpoint));
      if (row && row.userId === me) await remove(C.pushSubscriptions, row.$id);
      return { deleted: !!row && row.userId === me };
    },

    async updateNotificationPrefs(me, { prefs } = {}) {
      if (!prefs || typeof prefs !== 'object') fail(400, 'Preferenze non valide.');
      const clean = {};
      for (const cat of Object.keys(NOTIFY_CATEGORIES)) {
        const p = prefs[cat] || {};
        clean[cat] = { push: cat === 'digest' ? false : p.push !== false, email: p.email === true };
      }
      // Le notifiche dentro l'app restano sempre; qui si scelgono solo push ed email.
      await update(C.profiles, me, { notificationPrefs: JSON.stringify(clean) });
      return parsePrefs(JSON.stringify(clean));
    },

    async sendTestPush(me) {
      const res = await deliver(me, 'general', 'Le notifiche funzionano: ti avviseremo così.', '', { title: 'SwimIn', channels: ['push'] });
      if (!res.push) fail(409, 'Nessun dispositivo raggiungibile: riattiva le notifiche da questo browser.');
      return res;
    },
  };
}
