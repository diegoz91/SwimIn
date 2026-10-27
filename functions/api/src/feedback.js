/**
 * Suggerimenti e segnalazioni dall'app ("Scrivici"): tabella `feedback` senza permessi per i client,
 * letta e gestita solo dagli amministratori. Ogni messaggio nuovo avvisa gli admin (notifica `feedback`).
 */
export const FEEDBACK_KINDS = ['problema', 'idea', 'altro'];
const KIND_LABEL = { problema: 'problema', idea: 'idea', altro: 'messaggio' };

export function feedbackActions({ find, get, create, update, list, count, fail, C, Query, displayName, isAdmin, sendAlert, assertClean }) {
  const requireAdmin = async (me) => {
    if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
  };

  return {
    async sendFeedback(me, { kind = 'idea', message = '', page = '', userAgent = '' } = {}) {
      if (!FEEDBACK_KINDS.includes(kind)) fail(400, 'Tipo di messaggio non valido.');
      const text = String(message || '').trim();
      if (text.length < 10) fail(400, 'Scrivi almeno qualche parola (10 caratteri).');
      if (text.length > 2000) fail(400, 'Il messaggio può avere al massimo 2000 caratteri.');
      if (assertClean) assertClean(text, 'comment');
      const since = new Date(Date.now() - 3_600_000).toISOString();
      if ((await count(C.feedback, [Query.equal('userId', me), Query.greaterThan('$createdAt', since)])) >= 5) {
        fail(429, 'Hai già scritto 5 messaggi nell’ultima ora: riprova più tardi.');
      }
      const row = await create(C.feedback, {
        userId: me,
        kind,
        message: text,
        page: String(page || '').slice(0, 300),
        userAgent: String(userAgent || '').slice(0, 300),
        status: 'open',
      }, []);
      const who = displayName(await find(C.profiles, me));
      await sendAlert(`${KIND_LABEL[kind]} da ${who || 'un utente'}: ${text.slice(0, 140)}`, 'feedback').catch(() => null);
      return { ok: true, id: row.$id };
    },

    async adminListFeedback(me, { status = 'open' } = {}) {
      await requireAdmin(me);
      if (!['open', 'done'].includes(status)) fail(400, 'Stato non valido.');
      const { documents } = await list(C.feedback, [Query.equal('status', status), Query.orderDesc('$createdAt'), Query.limit(100)]);
      const people = new Map();
      const out = [];
      for (const f of documents) {
        if (!people.has(f.userId)) {
          const p = await find(C.profiles, f.userId);
          people.set(f.userId, p ? { name: displayName(p), userType: p.userType || '' } : { name: 'Account eliminato', userType: '' });
        }
        out.push({ ...f, ...people.get(f.userId) });
      }
      return out;
    },

    async adminSetFeedbackStatus(me, { feedbackId, status } = {}) {
      await requireAdmin(me);
      if (!['open', 'done'].includes(status)) fail(400, 'Stato non valido.');
      if (typeof feedbackId !== 'string' || !feedbackId) fail(400, 'Messaggio non valido.');
      await get(C.feedback, feedbackId);
      await update(C.feedback, feedbackId, { status });
      return { ok: true, status };
    },
  };
}
