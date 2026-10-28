/**
 * Moderazione: blocco e silenziamento tra utenti, pannello amministratori
 * (segnalazioni, sospensioni, rimozione contenuti) e registro degli errori del client.
 *
 * Gli amministratori sono gli utenti con l'etichetta "admin" nella console di
 * Appwrite (Auth → utente → Labels): un dato che solo la console o il server possono scrivere.
 */
import { Permission, Query, Role } from 'node-appwrite';

/**
 * Regole che giustificano una rimozione o una sospensione (Digital Services Act, art. 17: motivazione).
 * Le chiavi coincidono con i motivi delle segnalazioni, così il motivo segnalato è la proposta predefinita.
 */
export const MODERATION_GROUNDS = {
  spam: 'Spam o pubblicità non richiesta',
  molestie: 'Molestie, insulti o minacce',
  contenuto_inappropriato: 'Contenuto inappropriato o illegale',
  falso_profilo: 'Profilo falso o che si spaccia per un altro',
  offerta_ingannevole: 'Offerta di lavoro ingannevole',
  dati_altrui: 'Dati personali di altre persone senza consenso',
  altro: 'Altra violazione dei Termini di servizio',
};
const TARGET_LABEL = { post: 'post', comment: 'commento', job: 'annuncio', review: 'recensione', profile: 'profilo' };

/** Testo completo della motivazione inviato a chi riceve il provvedimento (email in testo semplice). */
export const statementOfReasons = ({ action, ground, targetType, excerpt, explanation, decidedAt }) => [
  action === 'suspend' ? 'Il tuo account SwimIn è stato sospeso.' : `Abbiamo rimosso un tuo contenuto (${TARGET_LABEL[targetType] || 'contenuto'}) da SwimIn.`,
  `Regola violata: ${MODERATION_GROUNDS[ground] || MODERATION_GROUNDS.altro} (Termini di servizio).`,
  excerpt ? `Contenuto interessato: "${excerpt}"` : '',
  explanation ? `Motivazione: ${explanation}` : '',
  `Decisione presa da una persona dello staff dopo una segnalazione, non da un sistema automatico, il ${new Date(decidedAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`,
  'Se pensi che sia un errore puoi contestarla rispondendo dalla funzione "Scrivici" di SwimIn o al contatto indicato nei Termini di servizio; puoi anche rivolgerti a un organismo di risoluzione extragiudiziale delle controversie o all\'autorità giudiziaria.',
].filter(Boolean).join('\n\n');

export function moderationActions({ find, get, create, update, remove, list, listAll, removeAll, count, fail, users, notify, C, displayName, sendEmail = null }) {
  const requireId = (v, name) => {
    if (typeof v !== 'string' || !v || v.length > 36) fail(400, `Parametro mancante: ${name}`);
    return v;
  };

  /** L'utente è amministratore (etichetta "admin" su Appwrite). */
  const isAdmin = async (userId) => {
    if (!users) return false;
    try {
      const u = await users.get({ userId });
      return (u.labels || []).includes('admin');
    } catch {
      return false;
    }
  };
  /** Responsabile delle richieste delle autorità: etichette "admin" e "legal" insieme. */
  const isLegal = async (userId) => {
    if (!users) return false;
    try {
      const u = await users.get({ userId });
      return (u.labels || []).includes('admin') && (u.labels || []).includes('legal');
    } catch {
      return false;
    }
  };
  const requireAdmin = async (me) => {
    if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
  };

  const relation = async (a, b, kind = 'block') =>
    (await list(C.blocks, [Query.equal('blockerId', [a, b]), Query.equal('blockedId', [a, b]), Query.equal('kind', kind), Query.limit(2)])).documents.filter(
      (r) => r.blockerId !== r.blockedId
    );

  /** Usato dalle altre azioni: niente messaggi, richieste o commenti tra utenti bloccati. */
  const assertNotBlocked = async (a, b) => {
    if (!a || !b || a === b) return;
    if ((await relation(a, b)).length) fail(403, 'Non puoi interagire con questo utente.');
  };

  /** Rimozione di un contenuto segnalato (post, commento, annuncio, recensione). */
  const removeTarget = async (targetType, targetId) => {
    if (targetType === 'post') {
      const post = await find(C.posts, targetId);
      if (!post) return null;
      await removeAll(C.likes, [Query.equal('postId', targetId)]);
      await removeAll(C.comments, [Query.equal('postId', targetId)]);
      await remove(C.posts, targetId);
      return post.authorId;
    }
    if (targetType === 'comment') {
      const comment = await find(C.comments, targetId);
      if (!comment) return null;
      await removeAll(C.comments, [Query.equal('parentCommentId', targetId)]);
      await remove(C.comments, targetId);
      const post = await find(C.posts, comment.postId);
      if (post) await update(C.posts, post.$id, { commentsCount: await count(C.comments, [Query.equal('postId', post.$id)]) });
      return comment.authorId;
    }
    if (targetType === 'job') {
      const job = await find(C.jobs, targetId);
      if (!job) return null;
      await update(C.jobs, targetId, { isActive: false });
      return job.structureId;
    }
    if (targetType === 'review') {
      const review = await find(C.reviews, targetId);
      if (!review) return null;
      await update(C.reviews, targetId, { status: 'hidden' });
      // media ricalcolata sulle sole recensioni pubblicate
      const published = await listAll(C.reviews, [Query.equal('structureId', review.structureId), Query.equal('status', 'published')]);
      await update(C.profiles, review.structureId, { ratingSum: published.reduce((s, r) => s + r.rating, 0), ratingCount: published.length });
      return review.authorId;
    }
    return null; // profili: si sospende l'account
  };

  const setSuspended = async (userId, suspended) => {
    if (await isAdmin(userId)) fail(400, 'Non puoi sospendere un amministratore.');
    if (users) await users.updateStatus({ userId, status: !suspended });
    const profile = await find(C.profiles, userId);
    if (profile) await update(C.profiles, userId, { suspended: !!suspended });
  };

  const preview = async (targetType, targetId) => {
    const table = { post: C.posts, comment: C.comments, job: C.jobs, review: C.reviews, profile: C.profiles }[targetType];
    const row = table ? await find(table, targetId) : null;
    if (!row) return { exists: false };
    const authorId = row.authorId || row.structureId || (targetType === 'profile' ? row.$id : null);
    const author = authorId ? await find(C.profiles, authorId) : null;
    const text = row.content || row.title || row.bio || (targetType === 'profile' ? displayName(row) : row.name) || '';
    return { exists: true, authorId, authorName: author ? displayName(author) : '', suspended: !!author?.suspended, text: String(text).slice(0, 400), status: row.status };
  };

  return {
    // ---------------- BLOCCO E SILENZIAMENTO ----------------
    async blockUser(me, { userId, kind = 'block' } = {}) {
      requireId(userId, 'userId');
      if (userId === me) fail(400, 'Non puoi bloccare te stesso.');
      if (!['block', 'mute'].includes(kind)) fail(400, 'Azione non valida.');
      await get(C.profiles, userId);
      const existing = (await list(C.blocks, [Query.equal('blockerId', me), Query.equal('blockedId', userId), Query.equal('kind', kind), Query.limit(1)])).documents[0];
      if (!existing) await create(C.blocks, { blockerId: me, blockedId: userId, kind }, [Permission.read(Role.user(me))]);
      if (kind === 'block') {
        // Il blocco rompe il collegamento e annulla le richieste in sospeso, in entrambe le direzioni.
        for (const [a, b] of [[me, userId], [userId, me]]) {
          const p = await find(C.profiles, a);
          if (p && (p.connections || []).includes(b)) await update(C.profiles, a, { connections: p.connections.filter((x) => x !== b) });
        }
        await removeAll(C.connections, [Query.equal('senderId', [me, userId]), Query.equal('receiverId', [me, userId]), Query.equal('status', 'pending')]);
      }
      return { ok: true };
    },

    async unblockUser(me, { userId, kind = 'block' } = {}) {
      requireId(userId, 'userId');
      await removeAll(C.blocks, [Query.equal('blockerId', me), Query.equal('blockedId', userId), Query.equal('kind', kind)]);
      return { ok: true };
    },

    /** Chi ho bloccato o silenziato e chi mi ha bloccato (solo gli id, per nascondere i contenuti). */
    async listBlockRelations(me) {
      const mine = await listAll(C.blocks, [Query.equal('blockerId', me)]);
      const byOthers = await listAll(C.blocks, [Query.equal('blockedId', me), Query.equal('kind', 'block')]);
      return {
        blocked: mine.filter((r) => r.kind === 'block').map((r) => r.blockedId),
        muted: mine.filter((r) => r.kind === 'mute').map((r) => r.blockedId),
        blockedBy: byOthers.map((r) => r.blockerId),
        isAdmin: await isAdmin(me),
        isLegal: await isLegal(me),
      };
    },

    // Errori dell'app: logClientError è in ops.js (registro unico con avvisi).

    // ---------------- AMMINISTRAZIONE ----------------
    async adminOverview(me) {
      await requireAdmin(me);
      const day = new Date(Date.now() - 86_400_000).toISOString();
      const [people, structures, posts, openReports, errors, pendingCerts, openFeedback] = await Promise.all([
        count(C.profiles, [Query.equal('userType', 'professional')]),
        count(C.profiles, [Query.equal('userType', 'structure')]),
        count(C.posts, []),
        count(C.reports, [Query.equal('status', 'open')]),
        count(C.clientErrors, [Query.greaterThan('$createdAt', day)]).catch(() => 0),
        count(C.profiles, [Query.equal('pendingVerification', true)]).catch(() => 0),
        C.feedback ? count(C.feedback, [Query.equal('status', 'open')]).catch(() => 0) : 0,
      ]);
      return { people, structures, posts, openReports, errors24h: errors, pendingCerts, openFeedback };
    },

    async adminListReports(me, { status = 'open' } = {}) {
      await requireAdmin(me);
      if (!['open', 'resolved', 'dismissed'].includes(status)) fail(400, 'Stato non valido.');
      const { documents } = await list(C.reports, [Query.equal('status', status), Query.orderDesc('$createdAt'), Query.limit(50)]);
      return Promise.all(
        documents.map(async (r) => {
          const reporter = await find(C.profiles, r.reporterId);
          return { ...r, reporterName: reporter ? displayName(reporter) : '', target: await preview(r.targetType, r.targetId) };
        })
      );
    },

    /**
     * Decisione su una segnalazione: archiviare, rimuovere il contenuto o sospendere l'autore.
     * Rimozioni e sospensioni sono motivate (regola violata e spiegazione): chi le riceve ha una
     * notifica con la decisione completa e un'email; chi ha segnalato viene informato dell'esito.
     */
    async adminResolveReport(me, { reportId, decision, note = '', ground, explanation = '' } = {}) {
      await requireAdmin(me);
      requireId(reportId, 'reportId');
      if (!['dismiss', 'remove', 'suspend'].includes(decision)) fail(400, 'Decisione non valida.');
      const report = await get(C.reports, reportId);
      const rule = ground ?? (MODERATION_GROUNDS[report.reason] ? report.reason : 'altro');
      if (!MODERATION_GROUNDS[rule]) fail(400, 'Regola non valida.');
      const why = String(explanation || '').trim().slice(0, 500);
      // Anteprima prima della rimozione: serve per dire all'autore quale contenuto è stato tolto.
      const before = await preview(report.targetType, report.targetId);
      let authorId = null;
      if (decision === 'remove') authorId = await removeTarget(report.targetType, report.targetId);
      if (decision === 'suspend') {
        if (!before.authorId) fail(404, 'Autore non trovato.');
        authorId = before.authorId;
        await setSuspended(authorId, true);
      }
      const decidedAt = new Date().toISOString();
      const resolution = { status: decision === 'dismiss' ? 'dismissed' : 'resolved', resolution: decision, resolvedBy: me, resolvedAt: decidedAt, note: String(note).slice(0, 1000), ground: decision === 'dismiss' ? null : rule };
      // Tutte le segnalazioni aperte sullo stesso contenuto si chiudono insieme.
      const same = await listAll(C.reports, [Query.equal('targetId', report.targetId), Query.equal('status', 'open')]);
      for (const r of same) await update(C.reports, r.$id, resolution);

      let decisionId = null;
      if (decision !== 'dismiss' && authorId) {
        const row = {
          userId: authorId, reportId, targetType: report.targetType, targetId: report.targetId, action: decision,
          ground: rule, explanation: why, excerpt: String(before.text || '').slice(0, 200), decidedAt,
        };
        decisionId = (await create(C.moderationDecisions, row, [])).$id;
        const label = MODERATION_GROUNDS[rule];
        await notify(authorId, 'moderation', decision === 'suspend' ? `Il tuo account è stato sospeso: ${label}.` : `Abbiamo rimosso un tuo contenuto: ${label}. Apri per la motivazione e per contestarla.`, decisionId);
        if (sendEmail) await sendEmail(authorId, decision === 'suspend' ? 'Il tuo account SwimIn è stato sospeso' : 'Un tuo contenuto è stato rimosso da SwimIn', statementOfReasons(row)).catch(() => null);
      }
      // Esito a chi ha segnalato (una volta per persona), senza dettagli sull'altro utente.
      const reporters = [...new Set(same.map((r) => r.reporterId))];
      for (const id of reporters) {
        await notify(id, 'general', decision === 'dismiss' ? 'Abbiamo esaminato la tua segnalazione: non abbiamo trovato violazioni delle regole.' : 'Abbiamo esaminato la tua segnalazione e preso provvedimenti. Grazie per averci aiutato.', '').catch(() => null);
      }
      return { ok: true, closed: same.length, decisionId };
    },

    /** La motivazione di un provvedimento: solo per chi l'ha ricevuto. */
    async getModerationDecision(me, { decisionId } = {}) {
      requireId(decisionId, 'decisionId');
      const row = await find(C.moderationDecisions, decisionId);
      if (!row || row.userId !== me) fail(404, 'Decisione non trovata.');
      return {
        id: row.$id, action: row.action, targetType: row.targetType, ground: row.ground, groundLabel: MODERATION_GROUNDS[row.ground] || MODERATION_GROUNDS.altro,
        explanation: row.explanation || '', excerpt: row.excerpt || '', decidedAt: row.decidedAt, automated: false,
      };
    },

    async adminSetSuspended(me, { userId, suspended } = {}) {
      await requireAdmin(me);
      requireId(userId, 'userId');
      if (userId === me) fail(400, 'Non puoi sospendere te stesso.');
      await setSuspended(userId, !!suspended);
      return { ok: true, suspended: !!suspended };
    },

    async adminListErrors(me) {
      await requireAdmin(me);
      return (await list(C.clientErrors, [Query.orderDesc('$createdAt'), Query.limit(100)])).documents;
    },

    async adminSearchUsers(me, { query = '' } = {}) {
      await requireAdmin(me);
      const q = String(query).trim();
      if (q.length < 2) return [];
      const { documents } = await list(C.profiles, [
        Query.or([Query.contains('firstName', q), Query.contains('lastName', q), Query.contains('structureName', q)]),
        Query.limit(25),
      ]);
      // L'email non è sul profilo: la cerchiamo negli account.
      const byEmail = q.includes('@') && users?.list ? (await users.list({ search: q }).catch(() => ({ users: [] }))).users || [] : [];
      const rows = [...documents];
      for (const u of byEmail.slice(0, 10)) {
        if (!rows.some((p) => p.$id === u.$id)) {
          const p = await find(C.profiles, u.$id);
          if (p) rows.push(p);
        }
      }
      const emails = Object.fromEntries(
        await Promise.all(rows.map(async (p) => [p.$id, users ? (await users.get({ userId: p.$id }).catch(() => ({ email: '' }))).email || '' : '']))
      );
      return rows.map((p) => ({ $id: p.$id, name: displayName(p), email: emails[p.$id], userType: p.userType, personType: p.personType, city: p.city, suspended: !!p.suspended }));
    },

    // esposti per le altre azioni (non chiamabili dal client: filtrati in main.js)
    _assertNotBlocked: assertNotBlocked,
    _isAdmin: isAdmin,
    _isLegal: isLegal,
  };
}
