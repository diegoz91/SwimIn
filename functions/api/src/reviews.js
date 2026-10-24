/**
 * Recensioni delle strutture (profili Struttura e pagine struttura).
 * Una recensione per persona e struttura; la struttura può rispondere.
 * La media è tenuta sul profilo/pagina come somma e conteggio (ratingSum, ratingCount).
 */
import { Permission, Query, Role } from 'node-appwrite';
import { makeAssertClean } from './textfilter.js';

const isMonth = (v) => /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(v);

export function reviewActions({ find, get, create, update, remove, list, fail, notify, C }) {
  /** La struttura recensita e chi la gestisce. */
  const target = async (structureId) => {
    const profile = await find(C.profiles, structureId);
    if (profile) {
      if (profile.userType !== 'structure') fail(400, 'Si possono recensire solo le strutture.');
      return { table: C.profiles, row: profile, managers: [profile.$id], name: profile.structureName || 'la struttura' };
    }
    const facility = await find(C.facilities, structureId);
    if (!facility) fail(404, 'Struttura non trovata.');
    return { table: C.facilities, row: facility, managers: facility.admins || [], name: facility.name || 'la struttura' };
  };

  /** Ricalcola media e numero dalle recensioni pubblicate (affidabile anche dopo errori parziali). */
  const recompute = async (t) => {
    let sum = 0;
    let count = 0;
    let cursor = null;
    for (;;) {
      const page = await list(C.reviews, [Query.equal('structureId', t.row.$id), Query.equal('status', 'published'), Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]);
      for (const r of page.documents) { sum += r.rating; count++; }
      if (page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }
    await update(t.table, t.row.$id, { ratingSum: sum, ratingCount: count });
    return { ratingSum: sum, ratingCount: count };
  };

  return {
    /** Crea o aggiorna la propria recensione. */
    async upsertReview(me, { structureId, rating, content, visitedAt = '' } = {}) {
      if (typeof structureId !== 'string' || !structureId) fail(400, 'Parametro mancante: structureId');
      const author = await get(C.profiles, me);
      if (author.userType !== 'professional') fail(403, 'Le strutture non possono recensire altre strutture.');
      const t = await target(structureId);
      if (t.managers.includes(me)) fail(403, 'Non puoi recensire una struttura che gestisci.');
      const stars = Number(rating);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail(400, 'Il voto va da 1 a 5 stelle.');
      const text = typeof content === 'string' ? content.trim() : '';
      if (text.length < 20) fail(400, 'Scrivi almeno 20 caratteri: racconta cosa ti è piaciuto o no.');
      if (text.length > 2000) fail(400, 'La recensione può avere al massimo 2000 caratteri.');
      makeAssertClean(fail)(text, 'text');
      if (visitedAt && (!isMonth(visitedAt) || visitedAt > new Date().toISOString().slice(0, 7))) fail(400, 'Data della visita non valida.');

      const existing = (await list(C.reviews, [Query.equal('structureId', structureId), Query.equal('authorId', me), Query.limit(1)])).documents[0];
      const data = { rating: stars, content: text, visitedAt: visitedAt || '', status: 'published', editedAt: existing ? new Date().toISOString() : '' };
      const review = existing
        ? await update(C.reviews, existing.$id, data)
        : await create(C.reviews, { ...data, structureId, authorId: me, reply: '', replyAt: '' }, [Permission.read(Role.users())]);
      const stats = await recompute(t);
      if (!existing) {
        const who = `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'Un utente';
        for (const m of t.managers) await notify(m, 'general', `${who} ha lasciato una recensione da ${stars} stelle a ${t.name}.`, structureId);
      }
      return { review, ...stats };
    },

    async deleteReview(me, { reviewId } = {}) {
      if (typeof reviewId !== 'string' || !reviewId) fail(400, 'Parametro mancante: reviewId');
      const review = await get(C.reviews, reviewId);
      if (review.authorId !== me) fail(403, 'Puoi eliminare solo le tue recensioni.');
      await remove(C.reviews, reviewId);
      const t = await target(review.structureId);
      return { deleted: true, ...(await recompute(t)) };
    },

    /** Risposta pubblica della struttura (una sola, modificabile). */
    async replyReview(me, { reviewId, reply } = {}) {
      if (typeof reviewId !== 'string' || !reviewId) fail(400, 'Parametro mancante: reviewId');
      const review = await get(C.reviews, reviewId);
      const t = await target(review.structureId);
      if (!t.managers.includes(me)) fail(403, 'Solo chi gestisce la struttura può rispondere.');
      const text = typeof reply === 'string' ? reply.trim() : '';
      if (text.length > 1000) fail(400, 'La risposta può avere al massimo 1000 caratteri.');
      const updated = await update(C.reviews, reviewId, { reply: text, replyAt: text ? new Date().toISOString() : '' });
      if (text && !review.reply) await notify(review.authorId, 'general', `${t.name} ha risposto alla tua recensione.`, review.structureId);
      return updated;
    },
  };
}
