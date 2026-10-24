/**
 * Riepilogo email settimanale: cosa è successo nella tua rete negli ultimi 7 giorni.
 * Lo lancia l'esecuzione programmata della Function (lunedì mattina, a blocchi orari);
 * ogni esecuzione tratta un gruppo di persone e segna `digestSentAt` sul profilo.
 * Niente email se non c'è nulla di nuovo, o se la persona l'ha disattivato.
 */
import { parsePrefs } from './push.js';

export const DIGEST_BATCH = 250;
const WEEK = 7 * 86_400_000;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Voci del riepilogo (testo e pagina da aprire), solo quelle con qualcosa da dire. */
export function digestItems(stats) {
  const items = [];
  if (stats.requests) items.push({ text: `${plural(stats.requests, 'richiesta di collegamento', 'richieste di collegamento')} da accettare`, url: '/network' });
  if (stats.unread) items.push({ text: `${plural(stats.unread, 'messaggio non letto', 'messaggi non letti')}`, url: '/messages' });
  if (stats.views) items.push({ text: `${plural(stats.views, 'persona ha visitato', 'persone hanno visitato')} il tuo profilo`, url: '/profile?visite=1' });
  if (stats.jobs) items.push({ text: `${plural(stats.jobs, 'nuova offerta', 'nuove offerte')} di lavoro nella tua provincia`, url: '/jobs' });
  if (stats.events) items.push({ text: `${plural(stats.events, 'evento', 'eventi')} a cui partecipi nei prossimi 7 giorni`, url: '/eventi' });
  if (stats.posts) items.push({ text: `${plural(stats.posts, 'nuovo post', 'nuovi post')} dai tuoi collegamenti`, url: '/' });
  return items;
}

export function digestHtml({ name, items, appUrl }) {
  const base = (appUrl || '').replace(/\/$/, '');
  const rows = items
    .map((i) => `<tr><td style="padding:10px 0;border-top:1px solid #E2EEF2;font-size:15px;color:#0A2738">${base ? `<a href="${escapeHtml(base + i.url)}" style="color:#0A2738;text-decoration:none">${escapeHtml(i.text)} <span style="color:#0E6A97">›</span></a>` : escapeHtml(i.text)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="it"><body style="margin:0;background:#F2F8FA;font-family:Helvetica,Arial,sans-serif;color:#0A2738">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #D7E6EC">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700">SwimIn</td></tr>
<tr><td style="padding:0 28px"><div style="height:4px;border-radius:2px;background:repeating-linear-gradient(90deg,#E23D3D 0 12px,#ffffff 12px 18px,#0E6A97 18px 30px,#ffffff 30px 36px)"></div></td></tr>
<tr><td style="padding:20px 28px 4px;font-size:18px;font-weight:700">Ciao ${escapeHtml(name)}, ecco la tua settimana</td></tr>
<tr><td style="padding:4px 28px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
${base ? `<tr><td style="padding:0 28px 28px"><a href="${escapeHtml(base)}/" style="display:inline-block;background:#0E6A97;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Apri SwimIn</a></td></tr>` : ''}
</table>
<p style="font-size:12px;color:#64748B;max-width:520px;margin:16px auto 0">Ricevi il riepilogo settimanale perché hai un account SwimIn. Puoi disattivarlo in ${base ? `<a href="${escapeHtml(base)}/profile?tab=impostazioni&amp;sezione=notifiche" style="color:#0E6A97">Impostazioni › Notifiche</a>` : 'Impostazioni › Notifiche'}.</p>
</td></tr></table></body></html>`;
}

export function digestActions({ list, count, update, C, Query, messaging, ID, displayName, appUrl, log }) {
  const statsFor = async (p, since, now) => {
    const sinceIso = new Date(since).toISOString();
    const today = new Date(now).toISOString().slice(0, 10);
    const inWeek = new Date(now + WEEK).toISOString().slice(0, 10);
    const connections = (p.connections || []).slice(0, 100);
    const [requests, unread, views, jobs, events, posts] = await Promise.all([
      count(C.connections, [Query.equal('receiverId', p.$id), Query.equal('status', 'pending')]),
      count(C.messages, [Query.equal('receiverId', p.$id), Query.equal('isRead', false)]),
      count(C.profileViews, [Query.equal('profileId', p.$id), Query.greaterThan('$createdAt', sinceIso)]),
      p.userType === 'professional' && p.province
        ? count(C.jobs, [Query.equal('isActive', true), Query.equal('province', p.province), Query.greaterThan('$createdAt', sinceIso)])
        : 0,
      count(C.swimMeets, [Query.contains('participants', [p.$id]), Query.equal('status', 'upcoming'), Query.greaterThanEqual('date', today), Query.lessThanEqual('date', inWeek)]),
      connections.length ? count(C.posts, [Query.equal('authorId', connections), Query.greaterThan('$createdAt', sinceIso)]) : 0,
    ]);
    return { requests, unread, views, jobs, events, posts };
  };

  return {
    /** Esecuzione programmata: invia il riepilogo a un gruppo di persone non ancora raggiunte questa settimana. */
    async _weeklyDigest({ now = Date.now(), batch = DIGEST_BATCH } = {}) {
      if (!messaging) return { sent: 0, skipped: 0, reason: 'email non configurate' };
      const cutoff = new Date(now - WEEK + 12 * 3_600_000).toISOString(); // un margine per gli orari del lunedì
      const candidates = [
        ...(await list(C.profiles, [Query.isNull('digestSentAt'), Query.limit(batch)])).documents,
        ...(await list(C.profiles, [Query.lessThan('digestSentAt', cutoff), Query.limit(batch)])).documents,
      ].slice(0, batch);
      let sent = 0;
      let skipped = 0;
      for (const p of candidates) {
        const stamp = { digestSentAt: new Date(now).toISOString() };
        try {
          if (p.suspended || !parsePrefs(p.notificationPrefs).digest?.email) { skipped++; await update(C.profiles, p.$id, stamp); continue; }
          const items = digestItems(await statsFor(p, now - WEEK, now));
          if (items.length) {
            await messaging.createEmail({
              messageId: ID.unique(),
              subject: 'La tua settimana su SwimIn',
              content: digestHtml({ name: p.userType === 'structure' ? displayName(p) : p.firstName || displayName(p), items, appUrl }),
              users: [p.$id],
              html: true,
            });
            sent++;
          } else skipped++;
          await update(C.profiles, p.$id, stamp);
        } catch (e) {
          log(`riepilogo non inviato a ${p.$id}: ${e?.message || e}`);
        }
      }
      return { sent, skipped, processed: candidates.length };
    },
  };
}
