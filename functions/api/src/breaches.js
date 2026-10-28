/**
 * Registro delle violazioni dei dati personali (GDPR art. 33.5): ogni violazione va documentata,
 * anche quando non si notifica. Con rischio medio o alto si avvisa il Garante entro 72 ore dalla
 * scoperta (art. 33); con rischio alto anche le persone coinvolte (art. 34).
 * Solo amministratori; ogni azione `admin*` finisce nel registro degli accessi.
 */
export const BREACH_RISKS = ['low', 'medium', 'high'];
export const GARANTE_HOURS = 72;

const iso = (v, name, fail) => {
  if (v === undefined || v === null || v === '') return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) fail(400, `Data non valida: ${name}.`);
  return new Date(t).toISOString();
};

/** Scadenza per il Garante e se è già passata (solo se il rischio la richiede e non è stato avvisato). */
export const garanteDeadline = (b, now = Date.now()) => {
  const due = new Date(Date.parse(b.detectedAt) + GARANTE_HOURS * 3_600_000).toISOString();
  const required = b.risk !== 'low';
  return { due, required, overdue: required && !b.garanteNotifiedAt && Date.parse(due) < now };
};

export function breachActions({ find, create, update, list, fail, C, Query, isAdmin, sendAlert = null }) {
  const requireAdmin = async (me) => {
    if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
  };
  const out = (b) => ({
    $id: b.$id, title: b.title, description: b.description, detectedAt: b.detectedAt, dataCategories: b.dataCategories || '',
    affectedCount: b.affectedCount || 0, risk: b.risk, status: b.status, garanteNotifiedAt: b.garanteNotifiedAt || '',
    usersNotifiedAt: b.usersNotifiedAt || '', measures: b.measures || '', createdAt: b.$createdAt, ...garanteDeadline(b),
  });

  return {
    async adminListBreaches(me) {
      await requireAdmin(me);
      const { documents } = await list(C.dataBreaches, [Query.orderDesc('$createdAt'), Query.limit(100)]);
      return documents.map(out);
    },

    /** Crea (senza breachId) o aggiorna una voce del registro. */
    async adminSaveBreach(me, p = {}) {
      await requireAdmin(me);
      const title = String(p.title || '').trim().slice(0, 200);
      const description = String(p.description || '').trim().slice(0, 4000);
      if (!title || !description) fail(400, 'Titolo e descrizione sono obbligatori.');
      if (!BREACH_RISKS.includes(p.risk)) fail(400, 'Livello di rischio non valido.');
      const status = p.status === 'closed' ? 'closed' : 'open';
      const detectedAt = iso(p.detectedAt, 'scoperta', fail);
      if (!detectedAt) fail(400, 'Indica quando è stata scoperta.');
      if (Date.parse(detectedAt) > Date.now() + 60_000) fail(400, 'La scoperta non può essere nel futuro.');
      const count = Math.floor(Number(p.affectedCount || 0));
      if (!(count >= 0 && count <= 10_000_000)) fail(400, 'Numero di persone coinvolte non valido.');
      const data = {
        title, description, detectedAt, risk: p.risk, status,
        dataCategories: String(p.dataCategories || '').slice(0, 500), affectedCount: count,
        garanteNotifiedAt: iso(p.garanteNotifiedAt, 'avviso al Garante', fail), usersNotifiedAt: iso(p.usersNotifiedAt, 'avviso alle persone', fail),
        measures: String(p.measures || '').slice(0, 4000), updatedBy: me,
      };
      if (status === 'closed' && p.risk !== 'low' && !data.garanteNotifiedAt) fail(400, 'Con rischio medio o alto indica quando hai avvisato il Garante prima di chiudere.');
      if (status === 'closed' && p.risk === 'high' && !data.usersNotifiedAt) fail(400, 'Con rischio alto indica quando hai avvisato le persone coinvolte prima di chiudere.');
      if (p.breachId) {
        if (!(await find(C.dataBreaches, p.breachId))) fail(404, 'Voce non trovata.');
        return out(await update(C.dataBreaches, p.breachId, data));
      }
      const row = await create(C.dataBreaches, { ...data, createdBy: me }, []);
      // Tutti gli amministratori sanno subito che il tempo per il Garante sta correndo.
      if (sendAlert) await sendAlert(`Violazione dei dati registrata: ${title}. Rischio ${p.risk === 'low' ? 'basso' : p.risk === 'medium' ? 'medio' : 'alto'}${p.risk !== 'low' ? `, avviso al Garante entro ${garanteDeadline(row).due.slice(0, 16).replace('T', ' ')} UTC` : ''}.`, 'data_breach').catch(() => null);
      return out(row);
    },
  };
}
