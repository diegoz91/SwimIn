/**
 * Statistiche: comparse nelle ricerche, visualizzazioni degli annunci, confronto con i 30 giorni
 * precedenti, chi visita per ruolo e provincia, annunci delle strutture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';
import { topCounts } from '../src/insights.js';
import { dayKey } from '../src/social.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25; let after = null;
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute]));
        if (q.method === 'limit') lim = q.values[0];
        if (q.method === 'cursorAfter') after = q.values[0];
      }
      const total = rows.length;
      if (after) rows = rows.slice(rows.findIndex((r) => r.$id === after) + 1);
      return { total, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $updatedAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return d; },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 30 * DAY).toISOString();
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

test('topCounts: i più frequenti, a parità in ordine alfabetico, il resto in Altri', () => {
  assert.deepEqual(topCounts(['MI', 'mi', 'TO', 'RM', 'RM', ''], 2), [{ label: 'MI', count: 2 }, { label: 'RM', count: 2 }, { label: 'Altri', count: 1 }]);
  assert.deepEqual(topCounts([]), []);
});

test('comparse nelle ricerche e visualizzazioni degli annunci', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, {});
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { premiumUntil: FUTURE }); P('bob'); P('sosp', { suspended: true });
  P('piscina', { userType: 'structure', structureName: 'Piscina Blu', premiumUntil: FUTURE, coAdmins: ['bob'], staff: ['bob'] });

  // Ricerca: solo profili esistenti e non sospesi, mai il proprio, una volta al giorno.
  assert.deepEqual(await api.recordSearchAppearances('bob', { profileIds: ['anna', 'bob', 'sosp', 'nessuno', 'anna'] }), { recorded: 1 });
  assert.deepEqual(await api.recordSearchAppearances('bob', { profileIds: ['anna'] }), { recorded: 0 });
  assert.equal(Object.keys(col('search_appearances')).length, 1);
  await assert.rejects(api.recordSearchAppearances('bob', {}), (e) => e.status === 400);
  const many = Array.from({ length: 50 }, (_, i) => `p${i}`);
  many.forEach((id) => P(id));
  assert.equal((await api.recordSearchAppearances('anna', { profileIds: many })).recorded, 30, 'al massimo 30 per chiamata');

  // Annunci: chi lo gestisce (struttura e co-amministratori) non conta; una volta al giorno per persona.
  col('jobs').j1 = { $id: 'j1', structureId: 'piscina', title: 'Istruttore', isActive: true, $createdAt: iso(2) };
  assert.deepEqual(await api.recordJobView('piscina', { jobId: 'j1' }), { recorded: false });
  assert.deepEqual(await api.recordJobView('bob', { jobId: 'j1' }), { recorded: false });
  assert.deepEqual(await api.recordJobView('anna', { jobId: 'j1' }), { recorded: true });
  assert.deepEqual(await api.recordJobView('anna', { jobId: 'j1' }), { recorded: false });
  assert.deepEqual(await api.recordJobView('anna', { jobId: 'nessuno' }), { recorded: false });
  // Un giorno precedente della stessa persona conta come un'altra visualizzazione, non come un'altra persona.
  col('job_views').old = { $id: 'old', jobId: 'j1', structureId: 'piscina', viewerId: 'anna', day: iso(1).slice(0, 10), at: iso(1) };
  col('applications').a1 = { $id: 'a1', jobId: 'j1', applicantId: 'anna', status: 'pending' };
  const [listed] = await api.listStructureJobs('piscina', {});
  assert.deepEqual([listed.views, listed.viewers, listed.applications.total], [2, 1, 1]);

  // Statistiche della struttura: annunci con visualizzazioni e candidature.
  const s = await api.getMyStats('piscina');
  assert.deepEqual(s.jobs.map((j) => [j.id, j.views, j.viewers, j.applications, j.newApplications]), [['j1', 2, 1, 1, 1]]);
});

test('statistiche: confronto con i 30 giorni precedenti, ruoli e province di chi visita', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, {});
  const P = (id, extra = {}) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { premiumUntil: FUTURE });
  P('lido', { userType: 'structure', structureName: 'Lido', structureType: 'Piscina comunale', province: 'MI' });
  P('marco', { title: 'Istruttore FIN', province: 'mi' });
  P('sara', { title: 'istruttore fin', province: 'TO' });
  P('ugo', { personType: 'enthusiast', province: 'MI' });
  P('base');

  const view = (viewer, daysAgo, anonymous = false) => {
    const at = iso(daysAgo);
    col('profile_views')[dayKey(viewer, 'anna', at.slice(0, 10))] = { $id: dayKey(viewer, 'anna', at.slice(0, 10)), profileId: 'anna', viewerId: viewer, viewedAt: at, anonymous };
  };
  view('lido', 1); view('lido', 3); view('marco', 2); view('sara', 5); view('ugo', 6); view('base', 4, true);
  view('marco', 40); view('sara', 45); view('lido', 70);
  col('search_appearances').s1 = { $id: 's1', profileId: 'anna', viewerId: 'lido', day: iso(1).slice(0, 10), at: iso(1) };
  col('search_appearances').s2 = { $id: 's2', profileId: 'anna', viewerId: 'lido', day: iso(2).slice(0, 10), at: iso(2) };
  col('search_appearances').s3 = { $id: 's3', profileId: 'anna', viewerId: 'marco', day: iso(35).slice(0, 10), at: iso(35) };
  col('posts').p1 = { $id: 'p1', authorId: 'anna', $createdAt: iso(3), likesCount: 4, commentsCount: 1, repostsCount: 0, content: 'Ciao' };
  col('posts').p2 = { $id: 'p2', authorId: 'anna', $createdAt: iso(40), likesCount: 2, commentsCount: 3, repostsCount: 1, content: 'Vecchio' };

  const s = await api.getMyStats('anna');
  assert.equal(s.viewsLast30, 6, 'una visita per persona e giorno');
  assert.equal(s.viewsPerDay.reduce((n, d) => n + d.views, 0), 6);
  assert.equal(s.anonymousViews, 1);
  assert.deepEqual(s.viewersByKind, { strutture: 1, professionisti: 2, appassionati: 1 });
  assert.deepEqual(s.viewersByRole[0], { label: 'Istruttore FIN', count: 2 }, 'ruoli uguali senza badare a maiuscole');
  assert.deepEqual(s.viewersByProvince, [{ label: 'MI', count: 3 }, { label: 'TO', count: 1 }]);
  assert.equal(s.searchesLast30, 2);
  assert.deepEqual(s.searchersByKind, { strutture: 1, professionisti: 0, appassionati: 0 });
  assert.deepEqual(s.totals, { reactions: 4, comments: 1, reposts: 0 });
  assert.deepEqual(s.previous, { views: 2, searches: 1, posts: 1, reactions: 2, comments: 3, reposts: 1 });
  assert.equal(s.postsLast30, 1);
  assert.deepEqual(s.jobs, [], 'gli annunci solo per le strutture');

  // Elenco dei visitatori: ogni persona una volta, anche con più giorni di visite.
  const v = await api.listProfileViews('anna');
  assert.equal(v.total, 5);
  assert.equal(new Set(v.viewers.filter((x) => x.id).map((x) => x.id)).size, v.viewers.filter((x) => x.id).length);
});
