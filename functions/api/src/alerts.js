/**
 * Avvisi di lavoro: chi cerca lavoro salva una ricerca (parole chiave, provincia,
 * contratto) e riceve una notifica appena una struttura pubblica un annuncio adatto.
 */
import { BASE_ALERTS, PREMIUM_ALERTS, isPremium } from './billing.js';

/** Al massimo PREMIUM_ALERTS avvisi (Premium), BASE_ALERTS con il piano Base. */
export const MAX_ALERTS = PREMIUM_ALERTS;
const MAX_NOTIFIED_PER_JOB = 500;

const norm = (s) => String(s || '').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Parole significative della ricerca (almeno 3 lettere). */
export const keywordsOf = (q) => [...new Set(norm(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))].slice(0, 6);

/** L'annuncio soddisfa l'avviso? Tutte le parole devono comparire in titolo, ruolo o descrizione. */
export function matchesAlert(alert, job) {
  if (alert.province && alert.province !== (job.province || '').toUpperCase()) return false;
  if (alert.contractType && alert.contractType !== job.contractType) return false;
  if (alert.sosOnly && !job.isSOS) return false;
  const words = keywordsOf(alert.query);
  if (!words.length) return true;
  const text = norm(`${job.title} ${job.role} ${job.description}`);
  return words.every((w) => text.includes(w));
}

export function alertActions({ find, list, listAll, create, remove, fail, notify, C, Query, Permission, Role }) {
  const clean = (data = {}) => {
    const query = typeof data.query === 'string' ? data.query.trim().slice(0, 60) : '';
    const province = typeof data.province === 'string' && /^[A-Za-z]{2}$/.test(data.province.trim()) ? data.province.trim().toUpperCase() : '';
    const contractType = typeof data.contractType === 'string' ? data.contractType.trim().slice(0, 100) : '';
    const sosOnly = !!data.sosOnly;
    if (!query && !province && !contractType && !sosOnly) fail(400, 'Indica almeno una parola chiave, una provincia o un tipo di contratto.');
    return { query, province, contractType, sosOnly };
  };

  return {
    async listJobAlerts(me) {
      const { documents } = await list(C.jobAlerts, [Query.equal('userId', me), Query.orderDesc('$createdAt'), Query.limit(MAX_ALERTS)]);
      return documents;
    },

    async createJobAlert(me, data = {}) {
      const profile = await find(C.profiles, me);
      if (!profile) fail(404, 'Profilo non trovato.');
      if (profile.userType === 'structure') fail(403, 'Gli avvisi di lavoro sono per chi cerca lavoro.');
      const alert = clean(data);
      const mine = await listAll(C.jobAlerts, [Query.equal('userId', me)]);
      if (mine.length >= MAX_ALERTS) fail(409, `Puoi avere al massimo ${MAX_ALERTS} avvisi: eliminane uno.`);
      if (!isPremium(profile) && mine.length >= BASE_ALERTS) {
        fail(402, `Con il piano Base puoi salvare ${BASE_ALERTS} avvisi di lavoro. Eliminane uno o passa a Premium per averne fino a ${PREMIUM_ALERTS}.`, 'premium_required');
      }
      const same = mine.find((a) => a.query === alert.query && (a.province || '') === alert.province && (a.contractType || '') === alert.contractType && !!a.sosOnly === alert.sosOnly);
      if (same) return same;
      return create(C.jobAlerts, { userId: me, ...alert }, [Permission.read(Role.user(me))]);
    },

    async deleteJobAlert(me, { alertId } = {}) {
      if (typeof alertId !== 'string' || !alertId) fail(400, 'Avviso non valido.');
      const alert = await find(C.jobAlerts, alertId);
      if (!alert || alert.userId !== me) fail(404, 'Avviso non trovato.');
      await remove(C.jobAlerts, alertId);
      return { deleted: true };
    },

    /** Dopo la pubblicazione di un annuncio: avvisa chi ha una ricerca salvata adatta (una notifica a persona). */
    async _notifyJobAlerts(job, publisherId) {
      const byProvince = job.province ? await listAll(C.jobAlerts, [Query.equal('province', job.province)]) : [];
      const everywhere = await listAll(C.jobAlerts, [Query.equal('province', '')]);
      const notified = new Set([publisherId]);
      let count = 0;
      for (const alert of [...byProvince, ...everywhere]) {
        if (count >= MAX_NOTIFIED_PER_JOB) break;
        if (notified.has(alert.userId) || !matchesAlert(alert, job)) continue;
        notified.add(alert.userId);
        const where = [job.city, job.province && `(${job.province})`].filter(Boolean).join(' ');
        await notify(alert.userId, 'job_alert', `Nuova offerta per il tuo avviso: ${job.title}${where ? ` a ${where}` : ''}.`, job.$id);
        count++;
      }
      return count;
    },
  };
}
