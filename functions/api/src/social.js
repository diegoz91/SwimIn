/**
 * Interazioni del feed e del profilo, come su LinkedIn:
 * reazioni ai post (consiglio, applauso, adoro…), mi piace ai commenti,
 * ripubblicazione (repost) e visualizzazioni del profilo.
 */
import crypto from 'node:crypto';
import { isPremium } from './billing.js';

/** Visitatori mostrati con il piano Base (gli altri si vedono con Premium). */
export const BASE_VISIBLE_VIEWERS = 3;

export const REACTIONS = ['consiglio', 'applauso', 'adoro', 'felice', 'interessante', 'sostegno'];

const REACTION_VERBS = {
  consiglio: 'ha consigliato',
  applauso: 'ha applaudito',
  adoro: 'adora',
  felice: 'ha reagito con un sorriso a',
  interessante: 'trova interessante',
  sostegno: 'sostiene',
};

const DAY = 86_400_000;
/** Una riga per visitatore, profilo e giorno: così si contano le visite giorno per giorno e si confrontano i periodi. */
export const dayKey = (...parts) => crypto.createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Anteprima di un post: le menzioni @[Nome](id) diventano @Nome e il taglio non spezza le parole. */
export const plainPreview = (content, max = 140) => {
  const text = String(content || '').replace(/@\[([^\]\n]{1,80})\]\([A-Za-z0-9_.-]{1,36}\)/g, '@$1').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

export function socialActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked }) {
  const requireId = (v, name) => {
    if (typeof v !== 'string' || !v || v.length > 36) fail(400, `Parametro mancante: ${name}`);
    return v;
  };

  /** Conteggi per tipo di reazione (i like vecchi senza tipo valgono come "consiglio"). */
  const recountReactions = async (postId) => {
    const total = await count(C.likes, [Query.equal('postId', postId)]);
    const counts = {};
    let typed = 0;
    for (const r of REACTIONS.slice(1)) {
      const n = await count(C.likes, [Query.equal('postId', postId), Query.equal('reaction', r)]);
      if (n) counts[r] = n;
      typed += n;
    }
    if (total - typed > 0) counts.consiglio = total - typed;
    await update(C.posts, postId, { likesCount: total, reactionCounts: JSON.stringify(counts) });
    return { likesCount: total, reactionCounts: counts };
  };

  const recountReposts = async (postId) => {
    const repostsCount = await count(C.posts, [Query.equal('repostOf', postId)]);
    await update(C.posts, postId, { repostsCount }).catch(() => null);
    return repostsCount;
  };

  return {
    /**
     * Reagisce a un post. La stessa reazione di nuovo la toglie; una diversa la sostituisce;
     * `reaction: null` la toglie in ogni caso.
     */
    async react(me, { postId, reaction = 'consiglio' } = {}) {
      postId = requireId(postId, 'postId');
      if (reaction !== null && !REACTIONS.includes(reaction)) fail(400, 'Reazione non valida.');
      const post = await get(C.posts, postId);
      const mine = (await list(C.likes, [Query.equal('postId', postId), Query.equal('userId', me), Query.limit(10)])).documents;
      const current = mine[0] ? mine[0].reaction || 'consiglio' : null;
      let next = reaction;
      if (reaction === current) next = null;
      // Eventuali doppioni (click simultanei) vengono ripuliti.
      for (const extra of mine.slice(1)) await remove(C.likes, extra.$id);
      if (!next) {
        if (mine[0]) await remove(C.likes, mine[0].$id);
      } else if (mine[0]) {
        await update(C.likes, mine[0].$id, { reaction: next });
      } else {
        await create(C.likes, { postId, userId: me, reaction: next }, [Permission.read(Role.users())]);
      }
      const totals = await recountReactions(postId);
      if (next && !current && post.authorId !== me) {
        const who = await find(C.profiles, me);
        await notify(post.authorId, 'like', `${who ? displayName(who) : 'Qualcuno'} ${REACTION_VERBS[next]} il tuo post.`, postId);
      }
      return { reaction: next, liked: !!next, ...totals };
    },

    /** Mi piace a un commento (si toglie con un secondo tocco). */
    async toggleCommentLike(me, { commentId } = {}) {
      commentId = requireId(commentId, 'commentId');
      const comment = await get(C.comments, commentId);
      const existing = (await list(C.commentLikes, [Query.equal('commentId', commentId), Query.equal('userId', me), Query.limit(5)])).documents;
      let liked;
      if (existing.length) {
        for (const l of existing) await remove(C.commentLikes, l.$id);
        liked = false;
      } else {
        await create(C.commentLikes, { commentId, postId: comment.postId, userId: me }, [Permission.read(Role.users())]);
        liked = true;
      }
      const likesCount = await count(C.commentLikes, [Query.equal('commentId', commentId)]);
      await update(C.comments, commentId, { likesCount });
      if (liked && comment.authorId !== me) {
        const who = await find(C.profiles, me);
        await notify(comment.authorId, 'comment', `${who ? displayName(who) : 'Qualcuno'} ha apprezzato il tuo commento.`, comment.postId);
      }
      return { liked, likesCount };
    },

    /**
     * Ripubblica un post con i propri collegamenti, eventualmente con un pensiero.
     * Si ripubblica sempre l'originale (non la ripubblicazione di qualcun altro).
     */
    async repost(me, { postId, content = '' } = {}) {
      postId = requireId(postId, 'postId');
      const target = await get(C.posts, postId);
      const original = target.repostOf ? await get(C.posts, target.repostOf) : target;
      await assertNotBlocked(me, original.authorId);
      const text = typeof content === 'string' ? content.trim() : '';
      if (text.length > 3000) fail(400, 'Il pensiero supera i 3000 caratteri.');
      if (!text) {
        const already = await count(C.posts, [Query.equal('authorId', me), Query.equal('repostOf', original.$id), Query.equal('content', '')]);
        if (already) fail(409, 'Hai già ripubblicato questo post.');
      }
      const author = await get(C.profiles, me);
      const row = await create(
        C.posts,
        {
          authorId: me,
          authorType: author.userType,
          content: text,
          postType: 'repost',
          visibility: 'public',
          category: 'generale',
          media: [],
          repostOf: original.$id,
          likesCount: 0,
          commentsCount: 0,
        },
        [Permission.read(Role.users())]
      );
      const repostsCount = await recountReposts(original.$id);
      if (original.authorId !== me) {
        await notify(original.authorId, 'repost', `${displayName(author)} ha ripubblicato il tuo post.`, row.$id);
      }
      return { ...row, originalRepostsCount: repostsCount };
    },

    /** Annulla una ripubblicazione senza pensiero (quella con pensiero si elimina come un post). */
    async undoRepost(me, { postId } = {}) {
      postId = requireId(postId, 'postId');
      const original = await get(C.posts, postId);
      const mine = await listAll(C.posts, [Query.equal('authorId', me), Query.equal('repostOf', original.$id), Query.equal('content', '')]);
      for (const p of mine) {
        await removeAll(C.likes, [Query.equal('postId', p.$id)]);
        await removeAll(C.comments, [Query.equal('postId', p.$id)]);
        await remove(C.posts, p.$id);
      }
      return { removed: mine.length, repostsCount: await recountReposts(original.$id) };
    },

    /**
     * Visita di un profilo: avvisa il proprietario (al massimo una volta ogni 24 ore per visitatore).
     * Chi naviga in modo anonimo (`hideProfileViews`) compare come "qualcuno".
     */
    async recordProfileView(me, { profileId } = {}) {
      profileId = requireId(profileId, 'profileId');
      if (profileId === me) return { recorded: false };
      const [profile, viewer] = await Promise.all([find(C.profiles, profileId), find(C.profiles, me)]);
      if (!profile || !viewer || profile.suspended) return { recorded: false };
      // Chi ha bloccato o è stato bloccato non lascia tracce.
      try { await assertNotBlocked(me, profileId); } catch { return { recorded: false }; }
      // Visita anonima: solo per chi è Premium e solo verso profili Base (chi è Premium vede sempre chi lo visita).
      const anonymous = !!viewer.hideProfileViews && isPremium(viewer) && !isPremium(profile);
      const now = new Date();
      const id = dayKey(me, profileId, isoDay(now.getTime()));
      const [today, yesterday] = await Promise.all([find(C.profileViews, id), find(C.profileViews, dayKey(me, profileId, isoDay(now.getTime() - DAY)))]);
      const last = today || yesterday;
      const recent = !!last && now.getTime() - new Date(last.viewedAt).getTime() < DAY;
      if (today) await update(C.profileViews, id, { viewedAt: now.toISOString(), anonymous });
      else await create(C.profileViews, { profileId, viewerId: me, viewedAt: now.toISOString(), anonymous }, [], id);
      if (!recent) {
        const text = anonymous ? 'Qualcuno ha visualizzato il tuo profilo.' : `${displayName(viewer)} ha visualizzato il tuo profilo.`;
        await notify(profileId, 'profile_view', text, anonymous ? '' : me);
      }
      return { recorded: true, notified: !recent };
    },

    /** Chi ha visto il mio profilo negli ultimi 30 giorni (Base: solo gli ultimi BASE_VISIBLE_VIEWERS). */
    async listProfileViews(me) {
      const owner = await get(C.profiles, me);
      const premium = isPremium(owner);
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      // Una riga per visitatore e giorno: qui conta ogni persona una volta, con la visita più recente.
      const all = (await listAll(C.profileViews, [Query.equal('profileId', me), Query.greaterThanEqual('viewedAt', since)]))
        .filter((v) => v.viewedAt >= since)
        .sort((a, b) => b.viewedAt.localeCompare(a.viewedAt));
      const seen = new Set();
      const unique = all.filter((v) => !seen.has(v.viewerId) && seen.add(v.viewerId));
      const total = unique.length;
      const documents = unique.slice(0, 50);
      const rows = [];
      for (const v of premium ? documents : documents.slice(0, BASE_VISIBLE_VIEWERS)) {
        if (v.anonymous) {
          rows.push({ id: null, name: 'Utente di SwimIn', headline: 'Ha scelto di navigare in modo anonimo', avatar: '', viewedAt: v.viewedAt });
          continue;
        }
        const p = await find(C.profiles, v.viewerId);
        if (!p || p.suspended) continue;
        rows.push({
          id: p.$id,
          name: displayName(p),
          headline: p.userType === 'structure' ? p.structureType || 'Struttura' : p.title || (p.personType === 'enthusiast' ? 'Appassionato di nuoto' : ''),
          avatar: (p.userType === 'structure' ? p.logo : p.avatar) || '',
          viewedAt: v.viewedAt,
        });
      }
      return { total, viewers: rows, premium, locked: premium ? 0 : Math.max(0, documents.length - rows.length) };
    },

    _recountReposts: recountReposts,
  };
}
