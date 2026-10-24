/**
 * Referenze scritte (come le raccomandazioni di LinkedIn): un collegamento, un
 * collega di staff o una struttura per cui hai lavorato scrive com'è lavorare con te.
 * Restano in attesa finché chi le riceve non le pubblica; può anche nasconderle.
 *  - in attesa / nascosta: leggibile solo da autore e destinatario;
 *  - pubblicata: leggibile da tutti gli iscritti.
 */
export const RELATIONSHIPS = ['collega', 'responsabile', 'collaboratore', 'allievo', 'struttura', 'altro'];
export const MAX_RECOMMENDATION = 3000;

export function recommendationActions({ assertClean = () => {}, find, get, list, listAll, create, update, remove, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked, isRecruiterOf = async () => false }) {
  const perms = (status, authorId, profileId) =>
    status === 'published' ? [Permission.read(Role.users())] : [Permission.read(Role.user(authorId)), Permission.read(Role.user(profileId))];

  /** Chi può scrivere una referenza: collegamenti reciproci, staff della stessa struttura, struttura e chi ha assunto o lavorato lì. */
  const canRecommend = async (me, profileId) => {
    const [author, target] = await Promise.all([get(C.profiles, me), get(C.profiles, profileId)]);
    const connected = (author.connections || []).includes(profileId) && (target.connections || []).includes(me);
    if (connected) return { author, target };
    const sameStaff = (author.userType === 'structure' && (author.staff || []).includes(profileId)) || (target.userType === 'structure' && (target.staff || []).includes(me));
    if (sameStaff) return { author, target };
    if ((await isRecruiterOf(me, profileId)) || (await isRecruiterOf(profileId, me))) return { author, target };
    fail(403, 'Puoi scrivere referenze solo ai tuoi collegamenti o a chi ha lavorato con te.');
  };

  const mineFor = async (authorId, profileId) =>
    (await list(C.recommendations, [Query.equal('profileId', profileId), Query.equal('authorId', authorId), Query.limit(1)])).documents[0] || null;

  return {
    /** Chiede una referenza a un collegamento (notifica con invito a scriverla). */
    async requestRecommendation(me, { profileId, message = '' } = {}) {
      if (typeof profileId !== 'string' || !profileId || profileId === me) fail(400, 'Profilo non valido.');
      await assertNotBlocked(me, profileId);
      await canRecommend(profileId, me); // chi riceve la richiesta deve poter scrivere a chi la chiede
      const recent = await list(C.notifications, [Query.equal('userId', profileId), Query.equal('type', 'recommendation_request'), Query.equal('relatedId', me), Query.limit(1)]);
      if (recent.documents.length) return { requested: true, already: true };
      const who = await find(C.profiles, me);
      const note = typeof message === 'string' && message.trim() ? `: “${message.trim().slice(0, 120)}”` : '.';
      await notify(profileId, 'recommendation_request', `${who ? displayName(who) : 'Un collegamento'} ti chiede una referenza${note}`, me);
      return { requested: true };
    },

    /** Scrive (o riscrive) la propria referenza per una persona: torna in attesa di approvazione. */
    async writeRecommendation(me, { profileId, relationship = 'collega', content } = {}) {
      if (typeof profileId !== 'string' || !profileId || profileId === me) fail(400, 'Profilo non valido.');
      await assertNotBlocked(me, profileId);
      const { author, target } = await canRecommend(me, profileId);
      if (target.userType === 'structure') fail(400, 'Le referenze si scrivono alle persone; per le strutture ci sono le recensioni.');
      const text = typeof content === 'string' ? content.trim() : '';
      if (text.length < 50) fail(400, 'Scrivi almeno 50 caratteri: racconta com’è lavorare con questa persona.');
      if (text.length > MAX_RECOMMENDATION) fail(400, `Massimo ${MAX_RECOMMENDATION} caratteri.`);
      assertClean(text, 'text');
      const rel = RELATIONSHIPS.includes(relationship) ? relationship : 'altro';
      const data = { profileId, authorId: me, relationship: author.userType === 'structure' ? 'struttura' : rel, content: text, status: 'pending' };
      const existing = await mineFor(me, profileId);
      let row;
      if (existing) {
        // Riscritta: torna privata finché non viene ripubblicata.
        row = await update(C.recommendations, existing.$id, data, perms('pending', me, profileId));
      } else {
        row = await create(C.recommendations, data, perms('pending', me, profileId));
      }
      await notify(profileId, 'recommendation', `${displayName(author)} ha scritto una referenza per te: leggila e decidi se pubblicarla.`, row.$id);
      return row;
    },

    /** Chi la riceve la pubblica, la nasconde o la elimina. */
    async respondRecommendation(me, { recommendationId, action } = {}) {
      if (typeof recommendationId !== 'string' || !recommendationId) fail(400, 'Referenza non valida.');
      const rec = await get(C.recommendations, recommendationId);
      if (rec.profileId !== me) fail(403, 'Puoi gestire solo le referenze che hai ricevuto.');
      if (action === 'delete') {
        await remove(C.recommendations, recommendationId);
        return { deleted: true };
      }
      if (!['publish', 'hide'].includes(action)) fail(400, 'Azione non valida.');
      const status = action === 'publish' ? 'published' : 'hidden';
      const saved = await update(C.recommendations, recommendationId, { status }, perms(status, rec.authorId, rec.profileId));
      if (status === 'published' && rec.status !== 'published') {
        const who = await find(C.profiles, me);
        await notify(rec.authorId, 'recommendation_published', `${who ? displayName(who) : 'La persona'} ha pubblicato la tua referenza sul suo profilo.`, me);
      }
      return saved;
    },

    /** L'autore ritira la propria referenza. */
    async deleteRecommendation(me, { recommendationId } = {}) {
      if (typeof recommendationId !== 'string' || !recommendationId) fail(400, 'Referenza non valida.');
      const rec = await get(C.recommendations, recommendationId);
      if (rec.authorId !== me) fail(403, 'Puoi ritirare solo le referenze che hai scritto.');
      await remove(C.recommendations, recommendationId);
      return { deleted: true };
    },

    /** Referenze di un profilo: pubblicate per tutti; per il proprietario anche in attesa e nascoste. */
    async listRecommendations(me, { profileId } = {}) {
      if (typeof profileId !== 'string' || !profileId) fail(400, 'Profilo non valido.');
      const rows = await listAll(C.recommendations, [Query.equal('profileId', profileId)]);
      const visible = rows.filter((r) => r.status === 'published' || r.profileId === me || r.authorId === me);
      const authors = new Map();
      for (const id of [...new Set(visible.map((r) => r.authorId))].slice(0, 100)) {
        const p = await find(C.profiles, id);
        if (p && !p.suspended) authors.set(id, { $id: id, name: displayName(p), avatar: p.avatar || p.logo || '', headline: p.userType === 'structure' ? p.structureType || 'Struttura' : p.title || '' });
      }
      return visible
        .filter((r) => authors.has(r.authorId))
        .sort((a, b) => String(b.$createdAt).localeCompare(String(a.$createdAt)))
        .map((r) => ({ $id: r.$id, $createdAt: r.$createdAt, profileId: r.profileId, authorId: r.authorId, relationship: r.relationship, content: r.content, status: r.status, author: authors.get(r.authorId) }));
    },

    /** Eliminazione dell'account: via le referenze scritte e ricevute. */
    async _removeAllFor(me) {
      for (const field of ['profileId', 'authorId']) {
        for (const r of await listAll(C.recommendations, [Query.equal(field, me)])) await remove(C.recommendations, r.$id);
      }
    },
  };
}
