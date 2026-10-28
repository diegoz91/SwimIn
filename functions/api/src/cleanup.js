/**
 * Pulizia notturna dei dati che non servono più (esecuzione programmata, alle 3 ora italiana).
 * Tiene il database leggero e rispetta i tempi di conservazione scritti nella privacy:
 * - righe scadute o ormai inutili: "sta scrivendo", inviti e cambi turno chiusi o superati,
 *   dirette finite da più di 30 giorni con i loro messaggi;
 * - tempi di conservazione: errori 30 giorni, notifiche lette 90 giorni (tutte dopo 12 mesi),
 *   visite al profilo e suggerimenti gestiti 12 mesi, registro accessi 12 mesi (richieste autorità 5 anni),
 *   copie sigillate alla scadenza della conservazione, segnalazioni chiuse e chat staff 12 mesi,
 *   turni dopo 24 mesi, candidature di annunci chiusi da 12 mesi;
 * - righe orfane: annunci di strutture che non esistono più (con le candidature e le copie dei CV),
 *   candidature senza annuncio, turni, inviti, modelli e chat di strutture eliminate;
 * - account lasciati dalla prova automatica (`swimin-e2e+…@example.com`) da più di 2 ore.
 */
const DAY = 86_400_000;
export const CLEANUP_HOUR = 3;

export function cleanupActions({ find, listAll, remove, removeAll, C, Query, users, log = () => {}, isoDay, removeApplication, deleteAccountOf, expireHolds = null }) {
  const ago = (days, now) => new Date(now - days * DAY).toISOString();

  return {
    async _nightlyCleanup({ now = Date.now() } = {}) {
      const out = {};
      const step = async (name, fn) => {
        try {
          out[name] = await fn();
        } catch (e) {
          out[name] = `errore: ${e?.message || e}`;
          log(`pulizia ${name}: ${e?.message || e}`);
        }
      };

      // Righe scadute.
      await step('typing', () => removeAll(C.typing, [Query.lessThan('until', ago(1 / 24, now))]));
      await step('inviti', async () =>
        (await removeAll(C.staffInvites, [Query.notEqual('status', 'pending'), Query.lessThan('$updatedAt', ago(30, now))])) +
        (await removeAll(C.staffInvites, [Query.equal('status', 'pending'), Query.lessThan('$createdAt', ago(60, now))])));
      await step('cambiTurno', async () => {
        let n = await removeAll(C.shiftSwaps, [Query.notEqual('status', 'pending'), Query.lessThan('$updatedAt', ago(30, now))]);
        // Richieste ancora aperte per turni ormai passati (o spariti).
        for (const w of await listAll(C.shiftSwaps, [Query.equal('status', 'pending')])) {
          const shift = await find(C.shifts, w.shiftId);
          if (!shift || shift.date < isoDay(now)) { await remove(C.shiftSwaps, w.$id); n++; }
        }
        return n;
      });
      await step('dirette', async () => {
        let n = 0;
        for (const room of await listAll(C.liveRooms, [Query.equal('status', 'ended'), Query.lessThan('$updatedAt', ago(30, now))])) {
          n += await removeAll(C.liveMessages, [Query.equal('roomId', room.$id)]);
          await remove(C.liveRooms, room.$id);
          n++;
        }
        return n;
      });

      // Tempi di conservazione.
      await step('errori', () => removeAll(C.clientErrors, [Query.lessThan('$createdAt', ago(30, now))]));
      await step('notifiche', async () =>
        (await removeAll(C.notifications, [Query.equal('isRead', true), Query.lessThan('$createdAt', ago(90, now))])) +
        (await removeAll(C.notifications, [Query.lessThan('$createdAt', ago(365, now))])));
      await step('visite', () => removeAll(C.profileViews, [Query.lessThan('$createdAt', ago(365, now))]));
      // Comparse nelle ricerche e visualizzazioni degli annunci: 12 mesi.
      await step('comparseRicerche', () => removeAll(C.searchAppearances, [Query.lessThan('day', isoDay(now - 365 * DAY))]));
      await step('visteAnnunci', () => removeAll(C.jobViews, [Query.lessThan('day', isoDay(now - 365 * DAY))]));
      // Registro degli accessi: 12 mesi; le voci delle richieste delle autorità 5 anni (prova di cosa è stato consegnato).
      await step('registroAccessi', async () =>
        (await removeAll(C.auditLog, [Query.equal('scope', 'admin'), Query.lessThan('$createdAt', ago(365, now))])) +
        (await removeAll(C.auditLog, [Query.equal('scope', 'legal'), Query.lessThan('$createdAt', ago(1825, now))])));
      // Conservazioni su ordine dell'autorità scadute: le copie sigillate si cancellano.
      if (expireHolds) await step('conservazioniScadute', () => expireHolds({ now }));
      // Segnalazioni chiuse, chat dello staff e turni passati (CSV per le paghe già scaricabile).
      await step('segnalazioniChiuse', () => removeAll(C.reports, [Query.notEqual('status', 'open'), Query.lessThan('$updatedAt', ago(365, now))]));
      await step('chatStaff', () => removeAll(C.staffMessages, [Query.lessThan('$createdAt', ago(365, now))]));
      await step('turniPassati', () => removeAll(C.shifts, [Query.lessThan('date', isoDay(now - 730 * DAY))]));
      // Candidature di annunci chiusi da più di 12 mesi (con CV allegati e valutazioni interne); l'annuncio resta.
      await step('candidatureChiuse', async () => {
        let n = 0;
        for (const job of await listAll(C.jobs, [Query.equal('isActive', false), Query.lessThan('$updatedAt', ago(365, now))])) {
          for (const a of await listAll(C.applications, [Query.equal('jobId', job.$id)])) { await removeApplication(a); n++; }
        }
        return n;
      });
      await step('suggerimenti', () => removeAll(C.feedback, [Query.equal('status', 'done'), Query.lessThan('$updatedAt', ago(365, now))]));

      // Righe orfane.
      const structures = new Map();
      const structureExists = async (id) => {
        if (!structures.has(id)) {
          const p = await find(C.profiles, id);
          structures.set(id, !!p && p.userType === 'structure');
        }
        return structures.get(id);
      };
      await step('annunciOrfani', async () => {
        let n = 0;
        for (const job of await listAll(C.jobs, [])) {
          if (await structureExists(job.structureId)) continue;
          for (const a of await listAll(C.applications, [Query.equal('jobId', job.$id)])) { await removeApplication(a); n++; }
          if (C.jobViews) n += await removeAll(C.jobViews, [Query.equal('jobId', job.$id)]);
          await remove(C.jobs, job.$id);
          n++;
        }
        return n;
      });
      await step('candidatureOrfane', async () => {
        let n = 0;
        const jobs = new Map();
        for (const a of await listAll(C.applications, [])) {
          if (!jobs.has(a.jobId)) jobs.set(a.jobId, !!(await find(C.jobs, a.jobId)));
          const applicant = jobs.get(a.jobId) ? await find(C.profiles, a.applicantId) : null;
          if (!jobs.get(a.jobId) || !applicant) { await removeApplication(a); n++; }
        }
        return n;
      });
      await step('areaStaffOrfana', async () => {
        let n = 0;
        for (const table of [C.shifts, C.shiftTemplates, C.staffMessages, C.staffChatReads, C.announcements, C.staffInvites]) {
          const ids = new Set((await listAll(table, [])).map((r) => r.structureId).filter(Boolean));
          for (const id of ids) if (!(await structureExists(id))) n += await removeAll(table, [Query.equal('structureId', id)]);
        }
        return n;
      });

      // Account rimasti dalla prova automatica (di solito li elimina la prova stessa).
      await step('accountDiProva', async () => {
        if (!users?.list || !deleteAccountOf) return 0;
        let n = 0;
        const { users: rows = [] } = await users.list({ queries: [Query.limit(50)], search: 'swimin-e2e' });
        for (const u of rows) {
          if (!/^swimin-e2e\+[a-z0-9-]+@example\.com$/i.test(u.email || '')) continue;
          if (Date.parse(u.$createdAt) > now - 2 * 3_600_000) continue; // forse una prova in corso
          await deleteAccountOf(u.$id);
          n++;
        }
        return n;
      });

      return out;
    },
  };
}
