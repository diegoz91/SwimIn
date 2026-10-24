/** Test del riepilogo email settimanale (esecuzione programmata della Function). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestActions, digestItems, digestHtml } from '../src/digest.js';

test('voci del riepilogo', () => {
  assert.deepEqual(digestItems({}), []);
  const items = digestItems({ requests: 1, unread: 3, views: 0, jobs: 2, events: 1, posts: 5 });
  assert.equal(items.length, 5);
  assert.equal(items[0].text, '1 richiesta di collegamento da accettare');
  assert.equal(items[1].text, '3 messaggi non letti');
  const html = digestHtml({ name: 'Anna <b>', items, appUrl: 'https://swimin.it/' });
  assert.ok(html.includes('Ciao Anna &lt;b&gt;'));
  assert.ok(html.includes('https://swimin.it/network'));
});

test('invio a gruppi, preferenze e timbro', async () => {
  const C = { profiles: 'profiles', connections: 'connections', messages: 'messages', profileViews: 'profile_views', jobs: 'jobs', swimMeets: 'swim_meets', posts: 'posts' };
  const Query = new Proxy({}, { get: (_, method) => (attribute, values) => ({ method, attribute, values }) });
  const profiles = {
    anna: { $id: 'anna', userType: 'professional', firstName: 'Anna', province: 'MI', connections: ['bob'], notificationPrefs: null, digestSentAt: null },
    bob: { $id: 'bob', userType: 'professional', firstName: 'Bob', connections: [], notificationPrefs: JSON.stringify({ digest: { push: false, email: false } }), digestSentAt: null },
    vuoto: { $id: 'vuoto', userType: 'professional', firstName: 'Vuoto', connections: [], digestSentAt: null },
  };
  const counts = { anna: { connections: 2, messages: 1, profile_views: 0, jobs: 4, swim_meets: 0, posts: 3 } };
  const sent = [];
  const api = digestActions({
    C, Query, ID: { unique: () => 'id' + sent.length }, appUrl: 'https://swimin.it', log: () => {},
    displayName: (p) => p.firstName,
    list: async (_t, queries) => {
      const q = queries[0];
      const docs = Object.values(profiles).filter((p) => (q.method === 'isNull' ? p.digestSentAt == null : p.digestSentAt && p.digestSentAt < q.values));
      return { documents: docs };
    },
    count: async (table, queries) => {
      const owner = queries.find((q) => ['receiverId', 'profileId'].includes(q.attribute))?.values ?? queries.find((q) => q.method === 'contains')?.values?.[0];
      const who = owner || (table === 'jobs' ? 'anna' : table === 'posts' ? 'anna' : null);
      return counts[who]?.[table] ?? 0;
    },
    update: async (_t, id, data) => Object.assign(profiles[id], data),
    messaging: { createEmail: async (m) => sent.push(m) },
  });

  const now = Date.parse('2026-10-26T06:00:00Z');
  const r = await api._weeklyDigest({ now });
  assert.deepEqual(r, { sent: 1, skipped: 2, processed: 3 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].users, ['anna']);
  assert.ok(sent[0].content.includes('4 nuove offerte'));
  assert.ok(Object.values(profiles).every((p) => p.digestSentAt === new Date(now).toISOString()));

  // Un'ora dopo nessuno riceve un secondo riepilogo.
  const again = await api._weeklyDigest({ now: now + 3_600_000 });
  assert.equal(again.processed, 0);
  assert.equal(sent.length, 1);

  // Senza provider email non fa nulla.
  const off = digestActions({ C, Query, messaging: null });
  assert.equal((await off._weeklyDigest()).sent, 0);
});
