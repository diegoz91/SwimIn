/**
 * Contenuti "social": #hashtag, @menzioni, tendenze, sondaggi nei post, seguire
 * (senza collegarsi). Le funzioni di estrazione sono pure e usate anche dai test.
 */
const HASHTAG = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]{2,40})/gu;
/** Menzione salvata nel testo: @[Nome visibile](idProfilo) — il client la mostra come link. */
const MENTION = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_.-]{1,36})\)/g;

export const MAX_TAGS = 10;
export const POLL_DAYS = [1, 3, 7, 14];

export function extractHashtags(text = '') {
  const out = [];
  for (const m of String(text).matchAll(HASHTAG)) {
    const tag = m[2].toLocaleLowerCase('it-IT');
    if (!/^\d+$/.test(tag) && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function extractMentions(text = '') {
  const out = [];
  for (const m of String(text).matchAll(MENTION)) {
    if (!out.includes(m[2])) out.push(m[2]);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Opzioni del sondaggio: 2–4, ognuna 1–80 caratteri, senza doppioni. */
export function cleanPoll(poll) {
  if (!poll) return null;
  const options = Array.isArray(poll.options) ? poll.options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (options.length < 2 || options.length > 4) return { error: 'Un sondaggio ha da 2 a 4 opzioni.' };
  if (options.some((o) => o.length > 80)) return { error: 'Ogni opzione può avere al massimo 80 caratteri.' };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: 'Le opzioni del sondaggio devono essere diverse.' };
  const days = Number(poll.days);
  if (!POLL_DAYS.includes(days)) return { error: 'Durata del sondaggio non valida.' };
  return { options, endsAt: new Date(Date.now() + days * 86_400_000).toISOString() };
}

export function contentActions({ find, get, list, listAll, create, update, remove, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked }) {
  /** Avvisa le persone menzionate (esistenti, non bloccate, non se stessi). */
  const notifyMentions = async (me, ids, postId, where = 'in un post') => {
    if (!ids.length) return [];
    const author = await find(C.profiles, me);
    const name = author ? displayName(author) : 'Qualcuno';
    const notified = [];
    for (const id of ids) {
      if (id === me) continue;
      const target = await find(C.profiles, id);
      if (!target || target.suspended) continue;
      try { await assertNotBlocked(me, id); } catch { continue; }
      await notify(id, 'mention', `${name} ti ha menzionato ${where}.`, postId);
      notified.push(id);
    }
    return notified;
  };

  const recountFollows = async (profileId) => {
    const [followersCount, followingCount] = await Promise.all([
      count(C.follows, [Query.equal('followeeId', profileId)]),
      count(C.follows, [Query.equal('followerId', profileId)]),
    ]);
    await update(C.profiles, profileId, { followersCount, followingCount }).catch(() => null);
    return { followersCount, followingCount };
  };

  return {
    _notifyMentions: notifyMentions,

    /** Segui (o smetti di seguire) una persona o una struttura, senza collegarti. */
    async toggleFollow(me, { profileId } = {}) {
      if (typeof profileId !== 'string' || !profileId || profileId === me) fail(400, 'Profilo non valido.');
      const target = await get(C.profiles, profileId);
      await assertNotBlocked(me, profileId);
      const existing = (await list(C.follows, [Query.equal('followerId', me), Query.equal('followeeId', profileId), Query.limit(5)])).documents;
      let following;
      if (existing.length) {
        for (const f of existing) await remove(C.follows, f.$id);
        following = false;
      } else {
        await create(C.follows, { followerId: me, followeeId: profileId }, [Permission.read(Role.users())]);
        following = true;
        const who = await find(C.profiles, me);
        await notify(profileId, 'follow', `${who ? displayName(who) : 'Qualcuno'} ha iniziato a seguirti.`, me);
      }
      const counts = await recountFollows(profileId);
      await recountFollows(me);
      return { following, followersCount: counts.followersCount, targetName: displayName(target) };
    },

    /** Hashtag più usati negli ultimi 7 giorni. */
    async getTrends() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { documents } = await list(C.posts, [Query.greaterThan('$createdAt', since), Query.orderDesc('$createdAt'), Query.limit(500)]);
      const counts = new Map();
      for (const p of documents) for (const t of p.hashtags || []) counts.set(t, (counts.get(t) || 0) + 1);
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))
        .slice(0, 10)
        .map(([tag, posts]) => ({ tag, posts }));
    },

    /** Voto (o cambio di voto) a un sondaggio aperto; option = null ritira il voto. */
    async votePoll(me, { postId, option } = {}) {
      const post = await get(C.posts, postId);
      const options = post.pollOptions || [];
      if (!options.length) fail(400, 'Questo post non ha un sondaggio.');
      if (post.pollEndsAt && new Date(post.pollEndsAt).getTime() < Date.now()) fail(409, 'Il sondaggio è chiuso.');
      if (option !== null && (!Number.isInteger(option) || option < 0 || option >= options.length)) fail(400, 'Opzione non valida.');
      const mine = (await list(C.pollVotes, [Query.equal('postId', postId), Query.equal('userId', me), Query.limit(5)])).documents;
      for (const v of mine.slice(1)) await remove(C.pollVotes, v.$id);
      if (option === null) {
        if (mine[0]) await remove(C.pollVotes, mine[0].$id);
      } else if (mine[0]) {
        await update(C.pollVotes, mine[0].$id, { option });
      } else {
        await create(C.pollVotes, { postId, userId: me, option }, [Permission.read(Role.user(me))]);
      }
      const counts = [];
      for (let i = 0; i < options.length; i++) counts.push(await count(C.pollVotes, [Query.equal('postId', postId), Query.equal('option', i)]));
      await update(C.posts, postId, { pollCounts: JSON.stringify(counts) });
      return { myVote: option, counts };
    },
  };
}
