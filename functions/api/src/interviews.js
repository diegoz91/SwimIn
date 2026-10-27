/**
 * Selezione dei candidati: note e valutazione **interne** (tabella `application_reviews`, mai
 * visibili al candidato: la candidatura invece la legge anche lui) e **proposta di colloquio**
 * con data, ora, modalità e luogo (campi sulla candidatura, così il candidato li vede e risponde).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const INTERVIEW_MODES = ['presenza', 'video', 'telefono'];
const MODE_LABEL = { presenza: 'in presenza', video: 'in videochiamata', telefono: 'al telefono' };
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function interviewActions({ find, get, create, update, listAll, fail, notify, C, Query, jobManagers, displayName, assertClean }) {
  const managedApplication = async (me, applicationId) => {
    if (typeof applicationId !== 'string' || !applicationId) fail(400, 'Candidatura non valida.');
    const application = await get(C.applications, applicationId);
    const job = await get(C.jobs, application.jobId);
    const managers = await jobManagers(job);
    if (!managers.includes(me)) fail(403, 'Non gestisci questo annuncio.');
    return { application, job, managers };
  };

  return {
    /** Note e valutazioni interne dei candidati di un annuncio (solo per chi lo gestisce). */
    async getApplicationReviews(me, { jobId } = {}) {
      if (typeof jobId !== 'string' || !jobId) fail(400, 'Annuncio non valido.');
      const job = await get(C.jobs, jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');
      const rows = await listAll(C.applicationReviews, [Query.equal('jobId', jobId)]);
      return Object.fromEntries(rows.map((r) => [r.$id, { rating: r.rating || 0, note: r.note || '', updatedBy: r.updatedBy || '', updatedAt: r.$updatedAt || r.$createdAt }]));
    },

    async saveApplicationReview(me, { applicationId, rating = 0, note = '' } = {}) {
      const { application } = await managedApplication(me, applicationId);
      const stars = Number(rating);
      if (!Number.isInteger(stars) || stars < 0 || stars > 5) fail(400, 'La valutazione va da 0 a 5 stelle.');
      const text = String(note || '').trim().slice(0, 2000);
      const data = { jobId: application.jobId, applicationId, rating: stars, note: text, updatedBy: me };
      // Una riga per candidatura (id = candidatura), condivisa da chi gestisce l'annuncio.
      const row = (await find(C.applicationReviews, applicationId)) ? await update(C.applicationReviews, applicationId, data) : await create(C.applicationReviews, data, [], applicationId);
      return { rating: row.rating, note: row.note, updatedBy: me, updatedAt: row.$updatedAt || new Date().toISOString() };
    },

    /**
     * Proposta di colloquio: data, ora, modalità e luogo (o link). Il candidato riceve una notifica,
     * la candidatura passa a "selezionata" se non lo era ancora; una nuova proposta sostituisce la precedente.
     */
    async proposeInterview(me, { applicationId, date, time, mode = 'presenza', place = '', message = '' } = {}) {
      const { application, job } = await managedApplication(me, applicationId);
      if (['hired', 'rejected'].includes(application.status)) fail(409, 'La candidatura è già chiusa.');
      if (!ISO_DATE.test(date || '') || date < isoDay(Date.now())) fail(400, 'Scegli una data da oggi in poi.');
      if (date > isoDay(Date.now() + 120 * 86_400_000)) fail(400, 'Al massimo 4 mesi in anticipo.');
      if (!TIME.test(time || '')) fail(400, 'Orario non valido.');
      if (!INTERVIEW_MODES.includes(mode)) fail(400, 'Modalità non valida.');
      const where = String(place || '').trim().slice(0, 300);
      if (mode === 'presenza' && where.length < 3) fail(400, 'Indica dove si terrà il colloquio.');
      if (mode === 'video' && where && !/^https:\/\//.test(where)) fail(400, 'Il link della videochiamata deve iniziare con https://');
      const note = String(message || '').trim().slice(0, 500);
      if (note) assertClean(note, 'comment');
      const updated = await update(C.applications, applicationId, {
        status: application.status === 'pending' || application.status === 'reviewed' ? 'accepted' : application.status,
        interviewDate: date,
        interviewTime: time,
        interviewMode: mode,
        interviewPlace: where,
        interviewMessage: note,
        interviewStatus: 'proposed',
        interviewReply: '',
        interviewReminderAt: '',
      });
      await notify(application.applicantId, 'application_update', `${job.structureName || 'La struttura'} ti propone un colloquio per "${job.title}" il ${ddmm(date)} alle ${time}, ${MODE_LABEL[mode]}.`, job.$id);
      return updated;
    },

    /** Il candidato accetta il colloquio o chiede un altro orario (con un messaggio). */
    async respondInterview(me, { applicationId, accept, reply = '' } = {}) {
      if (typeof applicationId !== 'string' || !applicationId) fail(400, 'Candidatura non valida.');
      const application = await get(C.applications, applicationId);
      if (application.applicantId !== me) fail(403, 'Puoi rispondere solo ai tuoi colloqui.');
      if (application.interviewStatus !== 'proposed') fail(409, 'Non c’è un colloquio da confermare.');
      const text = String(reply || '').trim().slice(0, 500);
      if (!accept && text.length < 3) fail(400, 'Scrivi quando saresti disponibile.');
      if (text) assertClean(text, 'comment');
      const job = await get(C.jobs, application.jobId);
      const updated = await update(C.applications, applicationId, { interviewStatus: accept ? 'accepted' : 'reschedule', interviewReply: text });
      const who = displayName(await get(C.profiles, me));
      const when = `${ddmm(application.interviewDate)} alle ${application.interviewTime}`;
      for (const id of await jobManagers(job)) {
        await notify(id, 'application', accept ? `${who} ha confermato il colloquio del ${when} per "${job.title}".` : `${who} chiede un altro orario per il colloquio di "${job.title}": «${text}»`, job.$id);
      }
      return updated;
    },
  };
}
