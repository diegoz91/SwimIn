/**
 * Registro degli accessi dello staff (tabella `audit_log`, senza permessi per i client, solo aggiunte).
 *
 * Ogni azione degli amministratori (`admin*`) e del responsabile delle richieste delle autorità
 * (`legal*`) viene registrata in automatico: chi, quando, cosa, su quale elemento, perché e con
 * quale esito (anche i tentativi negati). Si salvano solo identificativi e parametri brevi, mai i
 * contenuti (testi di messaggi, note, documenti). Le voci `legal*` le vede solo chi ha l'etichetta `legal`.
 */
export const NOT_AUDITED = new Set(['adminOverview', 'adminGetPlans']);
const TARGET_KEYS = ['subjectId', 'userId', 'profileId', 'reportId', 'holdId', 'applicationId', 'feedbackId', 'certId', 'jobId'];
const CONTENT_KEYS = /^(message|note|content|text|reply|reason|details|bio|until)$/i;

export const isAudited = (name) => /^(admin|legal)[A-Z]/.test(name) && !NOT_AUDITED.has(name);

/** Elemento coinvolto e parametri brevi da registrare (niente testi). */
export function describeParams(params = {}) {
  const key = TARGET_KEYS.find((k) => typeof params[k] === 'string' && params[k]);
  const meta = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === key || CONTENT_KEYS.test(k)) continue;
    if (['string', 'number', 'boolean'].includes(typeof v)) meta[k] = typeof v === 'string' ? v.slice(0, 80) : v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) meta[k] = Object.keys(v).slice(0, 10).join(',');
  }
  return {
    targetType: key ? key.replace(/Id$/, '') : '',
    targetId: key ? String(params[key]).slice(0, 80) : '',
    meta: Object.keys(meta).length ? JSON.stringify(meta).slice(0, 1000) : '',
  };
}

export function auditActions({ create, find, list, fail, C, Query, displayName, isAdmin, isLegal, log = () => {} }) {
  const record = async (actorId, action, { targetType = '', targetId = '', reason = '', outcome = 'ok', meta = '' } = {}) => {
    try {
      await create(C.auditLog, {
        actorId: String(actorId || 'system').slice(0, 36),
        action: String(action).slice(0, 60),
        scope: String(action).startsWith('legal') ? 'legal' : 'admin',
        targetType: String(targetType).slice(0, 30),
        targetId: String(targetId).slice(0, 80),
        reason: String(reason || '').slice(0, 500),
        outcome,
        meta: String(meta || '').slice(0, 1000),
      }, []);
    } catch (e) {
      log(`registro accessi: ${e?.message || e}`);
    }
  };

  /** Avvolge le azioni amministrative: registra esito, elemento e motivo di ogni chiamata. */
  const withAudit = (actions) => {
    for (const [name, fn] of Object.entries(actions)) {
      if (typeof fn !== 'function' || !isAudited(name)) continue;
      actions[name] = async (me, params = {}) => {
        const info = { ...describeParams(params), reason: typeof params?.reason === 'string' ? params.reason : '' };
        try {
          const result = await fn(me, params);
          await record(me, name, { ...info, outcome: 'ok' });
          return result;
        } catch (e) {
          await record(me, name, { ...info, outcome: e?.status === 403 ? 'denied' : 'error' });
          throw e;
        }
      };
    }
    return actions;
  };

  return {
    _audit: record,
    _withAudit: withAudit,

    /** Ultime voci del registro (amministratori); quelle delle richieste delle autorità solo a chi ha `legal`. */
    async adminListAudit(me, { action = '', actorId = '', limit = 200 } = {}) {
      if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
      const legal = await isLegal(me);
      const queries = [Query.orderDesc('$createdAt'), Query.limit(Math.min(500, Math.max(1, Number(limit) || 200)))];
      if (!legal) queries.push(Query.equal('scope', 'admin'));
      if (action) queries.push(Query.equal('action', String(action)));
      if (actorId) queries.push(Query.equal('actorId', String(actorId)));
      const { documents } = await list(C.auditLog, queries);
      const rows = documents.filter((r) => legal || r.scope !== 'legal');
      const names = new Map();
      for (const r of rows) {
        if (!names.has(r.actorId)) {
          const p = await find(C.profiles, r.actorId).catch(() => null);
          names.set(r.actorId, p ? displayName(p) : r.actorId);
        }
      }
      return rows.map((r) => ({ id: r.$id, at: r.$createdAt, actorId: r.actorId, actorName: names.get(r.actorId), action: r.action, scope: r.scope, targetType: r.targetType, targetId: r.targetId, reason: r.reason, outcome: r.outcome, meta: r.meta }));
    },
  };
}
