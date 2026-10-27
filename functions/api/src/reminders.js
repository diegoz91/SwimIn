/**
 * Promemoria della sera prima (esecuzione programmata oraria, dalle 18 ora italiana):
 * - turni di domani (da confermare o confermati) a chi li copre;
 * - colloqui confermati di domani al candidato e a chi gestisce l'annuncio.
 * Ogni promemoria parte una volta sola (`reminderSentAt` sul turno, `interviewReminderAt` sulla
 * candidatura); se il turno o il colloquio cambiano, il campo si azzera e il promemoria riparte.
 */
const REMINDER_HOUR = 18;

const romeParts = (ms) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

/** Data di domani in Italia e ora italiana adesso. */
export const romeTomorrow = (now) => ({ hour: romeParts(now).hour, tomorrow: romeParts(now + 86_400_000).date });

const MODE = { presenza: '', video: ' in videochiamata', telefono: ' al telefono' };

export function reminderActions({ find, listAll, update, notify, C, Query, displayName, jobManagers, log = () => {} }) {
  const names = new Map();
  const structureName = async (id) => {
    if (names.has(id)) return names.get(id);
    const p = (await find(C.profiles, id)) || (await find(C.facilities, id));
    const name = p ? p.structureName || p.name || displayName(p) : 'la struttura';
    names.set(id, name);
    return name;
  };

  return {
    async _sendReminders({ now = Date.now(), force = false } = {}) {
      const { hour, tomorrow } = romeTomorrow(now);
      if (!force && hour < REMINDER_HOUR) return { shifts: 0, interviews: 0, skipped: true };
      const stamp = new Date(now).toISOString();
      let shifts = 0;
      let interviews = 0;

      const due = await listAll(C.shifts, [Query.equal('date', tomorrow), Query.equal('status', ['scheduled', 'confirmed'])]);
      for (const s of due) {
        if (s.reminderSentAt || !['scheduled', 'confirmed'].includes(s.status)) continue;
        try {
          const where = await structureName(s.structureId);
          const text = s.status === 'confirmed'
            ? `Domani hai il turno ${s.shiftTime} presso ${where}.`
            : `Domani hai il turno ${s.shiftTime} presso ${where}: ricordati di confermarlo.`;
          await notify(s.userId, 'shift', text, s.structureId);
          await update(C.shifts, s.$id, { reminderSentAt: stamp });
          shifts++;
        } catch (e) {
          log(`promemoria turno ${s.$id}: ${e?.message || e}`);
        }
      }

      const meetings = await listAll(C.applications, [Query.equal('interviewDate', tomorrow), Query.equal('interviewStatus', 'accepted')]);
      for (const a of meetings) {
        if (a.interviewReminderAt || a.interviewStatus !== 'accepted' || ['hired', 'rejected'].includes(a.status)) continue;
        try {
          const job = await find(C.jobs, a.jobId);
          if (!job) continue;
          const where = job.structureName || (await structureName(job.structureId));
          const how = MODE[a.interviewMode] ?? '';
          const place = a.interviewMode === 'presenza' && a.interviewPlace ? ` (${a.interviewPlace})` : '';
          await notify(a.applicantId, 'application_update', `Domani alle ${a.interviewTime} hai il colloquio${how} con ${where} per "${job.title}"${place}.`, job.$id);
          const candidate = await find(C.profiles, a.applicantId);
          const who = candidate ? displayName(candidate) : 'il candidato';
          for (const id of await jobManagers(job)) await notify(id, 'application', `Domani alle ${a.interviewTime} colloquio${how} con ${who} per "${job.title}".`, job.$id);
          await update(C.applications, a.$id, { interviewReminderAt: stamp });
          interviews++;
        } catch (e) {
          log(`promemoria colloquio ${a.$id}: ${e?.message || e}`);
        }
      }
      return { shifts, interviews };
    },
  };
}
