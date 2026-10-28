/**
 * Statistiche: visite al profilo, comparse nelle ricerche e visualizzazioni degli annunci.
 *
 * - `search_appearances`: una riga per chi cerca, profilo e giorno (il profilo è comparso tra i
 *   risultati di /cerca). La scrive solo la Function, nessun permesso per i client.
 * - `job_views`: una riga per persona, annuncio e giorno (chi gestisce l'annuncio non conta).
 * - `getMyStats` (Premium): ultimi 30 giorni confrontati con i 30 precedenti, chi visita per tipo,
 *   ruolo e provincia, comparse nelle ricerche, post e, per le strutture, gli annunci.
 */
import { isPremium } from './billing.js';
import { dayKey, plainPreview } from './social.js';

const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Al massimo tanti profili per chiamata (una pagina di risultati). */
export const MAX_SEARCH_IDS = 30;
const EMPTY_APPS = { total: 0, pending: 0, reviewed: 0, accepted: 0, hired: 0, rejected: 0 };

const kindOf = (p) => (p.userType === 'structure' ? 'strutture' : p.personType === 'enthusiast' ? 'appassionati' : 'professionisti');
const roleOf = (p) => {
  if (p.userType === 'structure') return String(p.structureType || 'Struttura').trim();
  if (p.personType === 'enthusiast') return 'Appassionato di nuoto';
  return String(p.title || '').trim() || 'Senza qualifica';
};

/** I primi `n` valori per frequenza (a parità, in ordine alfabetico), il resto in "Altri". */
export const topCounts = (values, n = 5, other = 'Altri') => {
  const map = new Map();
  for (const v of values) {
    if (!v) continue;
    const key = v.toLowerCase();
    const cur = map.get(key) || { label: v, count: 0 };
    cur.count += 1;
    map.set(key, cur);
  }
  const sorted = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'));
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, r) => s + r.count, 0);
  return rest ? [...top, { label: other, count: rest }] : top;
};

export function insightsActions({ find, get, list, listAll, create, fail, C, Query, mapLimit, jobManagers }) {
  const since = (days, now) => new Date(now - days * DAY).toISOString();

  /** Conteggi di visualizzazioni (righe) e persone diverse per ogni annuncio. */
  const jobViewCounts = async (jobIds) => {
    const out = {};
    for (let i = 0; i < jobIds.length; i += 50) {
      const ids = jobIds.slice(i, i + 50);
      for (const v of await listAll(C.jobViews, [Query.equal('jobId', ids)])) {
        const c = (out[v.jobId] ??= { views: 0, people: new Set() });
        c.views += 1;
        c.people.add(v.viewerId);
      }
    }
    return Object.fromEntries(Object.entries(out).map(([id, c]) => [id, { views: c.views, viewers: c.people.size }]));
  };

  return {
    /**
     * I profili comparsi nei risultati di una ricerca: una riga per chi cerca, profilo e giorno.
     * Solo profili esistenti e non sospesi, mai il proprio.
     */
    async recordSearchAppearances(me, { profileIds } = {}) {
      if (!Array.isArray(profileIds)) fail(400, 'Parametro mancante: profileIds');
      const ids = [...new Set(profileIds.filter((id) => typeof id === 'string' && id && id.length <= 36 && id !== me))].slice(0, MAX_SEARCH_IDS);
      if (!ids.length) return { recorded: 0 };
      const { documents } = await list(C.profiles, [Query.equal('$id', ids), Query.limit(ids.length)]);
      const valid = documents.filter((p) => !p.suspended).map((p) => p.$id);
      const now = Date.now();
      const day = isoDay(now);
      const created = await mapLimit(valid, 8, async (profileId) => {
        const id = dayKey('s', me, profileId, day);
        if (await find(C.searchAppearances, id)) return 0;
        await create(C.searchAppearances, { profileId, viewerId: me, day, at: new Date(now).toISOString() }, [], id);
        return 1;
      });
      return { recorded: created.reduce((a, b) => a + b, 0) };
    },

    /** Qualcuno ha aperto un annuncio: una riga al giorno per persona (chi lo gestisce non conta). */
    async recordJobView(me, { jobId } = {}) {
      if (typeof jobId !== 'string' || !jobId || jobId.length > 36) fail(400, 'Parametro mancante: jobId');
      const job = await find(C.jobs, jobId);
      if (!job || (await jobManagers(job)).includes(me)) return { recorded: false };
      const now = Date.now();
      const day = isoDay(now);
      const id = dayKey('j', me, jobId, day);
      if (await find(C.jobViews, id)) return { recorded: false };
      await create(C.jobViews, { jobId, structureId: job.structureId, viewerId: me, day, at: new Date(now).toISOString() }, [], id);
      return { recorded: true };
    },

    _jobViewCounts: jobViewCounts,

    /** Statistiche del profilo, dei post e degli annunci (Premium). */
    async getMyStats(me) {
      const owner = await get(C.profiles, me);
      if (!isPremium(owner)) fail(402, 'Le statistiche sono incluse in SwimIn Premium.', 'premium_required');
      const now = Date.now();
      const cur = since(30, now);
      const prev = since(60, now);
      const curDay = cur.slice(0, 10);
      const prevDay = prev.slice(0, 10);

      // Visite: una riga per visitatore e giorno.
      const allViews = (await listAll(C.profileViews, [Query.equal('profileId', me), Query.greaterThanEqual('viewedAt', prev)])).filter((v) => v.viewedAt >= prev);
      const views = allViews.filter((v) => v.viewedAt >= cur);
      const prevViews = allViews.length - views.length;
      const days = Array.from({ length: 30 }, (_, i) => isoDay(now - (29 - i) * DAY));
      const perDay = Object.fromEntries(days.map((d) => [d, 0]));
      for (const v of views) {
        const d = String(v.viewedAt).slice(0, 10);
        if (d in perDay) perDay[d] += 1;
      }

      // Comparse nelle ricerche.
      const allSearches = (await listAll(C.searchAppearances, [Query.equal('profileId', me), Query.greaterThanEqual('day', prevDay)])).filter((s) => s.day >= prevDay);
      const searches = allSearches.filter((s) => s.day >= curDay);

      // Chi visita e chi cerca: ogni persona una volta.
      const visitorIds = [...new Set(views.filter((v) => !v.anonymous).map((v) => v.viewerId))].slice(0, 150);
      const searcherIds = [...new Set(searches.map((s) => s.viewerId))].slice(0, 150);
      const people = new Map();
      await mapLimit([...new Set([...visitorIds, ...searcherIds])], 8, async (id) => {
        const p = await find(C.profiles, id);
        if (p && !p.suspended) people.set(id, p);
      });
      const visitors = visitorIds.map((id) => people.get(id)).filter(Boolean);
      const searchers = searcherIds.map((id) => people.get(id)).filter(Boolean);
      const byKind = (list) => {
        const out = { strutture: 0, professionisti: 0, appassionati: 0 };
        for (const p of list) out[kindOf(p)] += 1;
        return out;
      };

      // Post: totali degli ultimi 30 giorni confrontati con i 30 precedenti; elenco degli ultimi 20.
      const windowPosts = (await list(C.posts, [Query.equal('authorId', me), Query.greaterThanEqual('$createdAt', prev), Query.orderDesc('$createdAt'), Query.limit(100)])).documents.filter((p) => p.$createdAt >= prev);
      const sum = (list) => ({
        reactions: list.reduce((n, p) => n + (p.likesCount || 0), 0),
        comments: list.reduce((n, p) => n + (p.commentsCount || 0), 0),
        reposts: list.reduce((n, p) => n + (p.repostsCount || 0), 0),
      });
      const curPosts = windowPosts.filter((p) => p.$createdAt >= cur);
      const prevTotals = sum(windowPosts.filter((p) => p.$createdAt < cur));
      const posts = (await list(C.posts, [Query.equal('authorId', me), Query.orderDesc('$createdAt'), Query.limit(20)])).documents;

      // Strutture: visualizzazioni e candidature degli ultimi annunci.
      let jobs = [];
      if (owner.userType === 'structure') {
        const rows = (await list(C.jobs, [Query.equal('structureId', me), Query.orderDesc('$createdAt'), Query.limit(10)])).documents;
        const ids = rows.map((j) => j.$id);
        const viewCounts = ids.length ? await jobViewCounts(ids) : {};
        const apps = {};
        if (ids.length) {
          for (const a of await listAll(C.applications, [Query.equal('jobId', ids)])) {
            const c = (apps[a.jobId] ??= { ...EMPTY_APPS });
            c.total += 1;
            if (c[a.status] !== undefined) c[a.status] += 1;
          }
        }
        jobs = rows.map((j) => ({
          id: j.$id, title: j.title, isActive: j.isActive !== false, isSOS: !!j.isSOS, createdAt: j.$createdAt,
          views: viewCounts[j.$id]?.views || 0, viewers: viewCounts[j.$id]?.viewers || 0,
          applications: apps[j.$id]?.total || 0, newApplications: apps[j.$id]?.pending || 0,
        }));
      }

      return {
        viewsLast30: views.length,
        viewsPerDay: days.map((d) => ({ day: d, views: perDay[d] })),
        viewersByKind: byKind(visitors),
        viewersByRole: topCounts(visitors.map(roleOf)),
        viewersByProvince: topCounts(visitors.map((p) => String(p.province || '').toUpperCase()), 5, 'Altre'),
        anonymousViews: views.filter((v) => v.anonymous).length,
        searchesLast30: searches.length,
        searchersByKind: byKind(searchers),
        posts: posts.map((p) => ({ id: p.$id, createdAt: p.$createdAt, text: plainPreview(p.content, 140), reactions: p.likesCount || 0, comments: p.commentsCount || 0, reposts: p.repostsCount || 0 })),
        postsLast30: curPosts.length,
        totals: sum(curPosts),
        previous: { views: prevViews, searches: allSearches.length - searches.length, posts: windowPosts.length - curPosts.length, ...prevTotals },
        jobs,
      };
    },
  };
}
